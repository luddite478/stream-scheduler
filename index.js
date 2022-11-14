const fs = require('fs')
require('dotenv').config()
const axios = require('axios')
const URL = require('url')
const path = require('path')
const moment = require('moment')
const momentDurationFormatSetup = require("moment-duration-format")
momentDurationFormatSetup(moment)
const { format, parseISO, formatISO } = require('date-fns')
const { formatInTimeZone } = require('date-fns-tz')

const { is_valid_state } = require('./state/validation')
const { save_pages_state} = require('./state')

const { merge_audio_and_video, 
		merge_audio_and_image, 
		loop_audio, 
		loop_video } = require('./ffmpeg')

const { download_file, 
		is_json_string, 
		get_time_interval_sec, 
		get_duration } = require('./utils')

const { save_ffplayout_playlist,
		delete_ffplayout_playlist,
		get_ffplayout_files_list } = require('./ffplayout')

const { get_playlist_pages_meta,
		get_page_contents,
		get_page,
		set_page_play_time } = require('./notion')


const is_accepted_media_type = (type) => type === 'video' || type === 'audio' || type === 'image' || type === 'synced_block'
const filter_out_unneeded_block_data = (block) => {
	return {
		type: block.type,
		[block.type]: block[block.type],
		parent_page_id: block.parent.page_id,
		created_time: block.created_time
	}
}

async function get_playlist_pages_data(playlist_pages_meta) {
	try {
		return await Promise.all(
			playlist_pages_meta.map(async (page_meta) => {
				return { 
					meta: { 
						id:	page_meta.id,
						play_time: page_meta.properties['play time'].date,
						params: page_meta.properties.params.rich_text,
						last_edited_time: page_meta.last_edited_time,
						tags: page_meta.properties['tags'].multi_select.map(t=>t.name)
					},
					contents: await get_page_contents(page_meta.id)
				}
			})
		)
	} catch(e) {
		console.log('get_playlist_pages_data error:', e)
	}
}

function filter_pages_data(playlist_pages_data) {
	try {
		const a = playlist_pages_data.map((page_data) => {
				// filter contents
				const { contents } = page_data
				const accepted_blocks = contents.filter((block) => is_accepted_media_type(block.type))
				const filtered_blocks = accepted_blocks.map((block) => filter_out_unneeded_block_data(block))
				
				return { 
					meta: { 
						id:	page_data.meta.id,
						...page_data.meta,
					},
					contents: filtered_blocks
				}

			// filter empty pages
			}).filter(page_data => page_data.contents.length > 0)

		return a

	} catch(e) {
		console.log('filter_pages_data error:', e)
	}
}

function create_block_filename(block, row) {
	const type = block.type
	const parent_page_id = block.parent_page_id
	const parsed_url = URL.parse(block[type].file.url, true)
	const created_time = moment(block.created_time).format('YYYYMMDD[T]HHmmss[Z]')
	const [ , , , url_filename ]  = parsed_url.pathname.split('/')
	const { name, ext} = path.parse(url_filename)
	return `${name}-row=${row}-created=${created_time}-p_id=${parent_page_id}${ext}`
}


function does_block_file_exist(filename) {
	const file_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
	return fs.existsSync(file_path)
}

async function download_pages_files_if_not_exist(playlist_pages_data) {
	try {
		// Download files from Notion if needed
		console.log('\nChecking pages media files on the disk...')

		const block_files_to_download = []
		playlist_pages_data.map((page_data) => {
			page_data.contents.map((block, i) => {

				if (!Object.hasOwn(block[block.type], 'file')) {
					console.log('\nBlock is not a file')
				 	return
				}

				const filename = create_block_filename(block, i+1)

				// Check if file exists on the disk
				if (does_block_file_exist(filename)) {
					console.log(`\nFile ${filename} already exists`)
					return
				}
				
				const url = block[block.type].file.url
				const dst_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
				block_files_to_download.push({url, dst_path})
			})
		})	

		if (block_files_to_download.length > 0) {
			console.log(`\nGoing to download ${block_files_to_download.length} file(s)`)
			await Promise.all(block_files_to_download.map(({ url, dst_path }) => download_file(url, dst_path)))
			console.log('\nFiles are successfully downloaded')				
		}
		
		// Add files paths to pages contents info 
		return playlist_pages_data.map((page_data) => {
			return  {
				...page_data,
				contents: page_data.contents.map((block, i) => {
					return {
						...block,
						file_path: path.join(process.env.TMP_MEDIA_FOLDER, create_block_filename(block, i+1))
					}
				})
			}
		})
		
	} catch(e) {
		console.log('Error while downloading Notion files: ', e)
	}

}

function get_number_of_repeats_and_remainder(file, target_duration) {
	const file_duration = get_duration(file)
	const repeats = Math.floor(target_duration/file_duration)
	const remainder = target_duration % file_duration
	console.log('\n***')
	console.log('Calculating repeats number to match target duration for file:\n',file)
	console.log('target duration:', target_duration)
	console.log('file duration:', file_duration)
	console.log('repeats:', repeats)
	console.log('remainder:', remainder)
	console.log('***')
	return { repeats, remainder }
}

function merge_page_media_files(audio_files, video_files, params, output_path) {

	try {
		// one video, one audio
		if (audio_files.length === 1 && 
		    video_files.length === 1 && 
		    video_files[0].hasOwnProperty('video')) { // TODO: add multiple files support

			// loop to match duration
			const { repeats: a_repeats, remainder: a_remainder }  = get_number_of_repeats_and_remainder((audio_files[0].audio), params.duration)
			const { repeats: v_repeats, remainder: v_remainder }  = get_number_of_repeats_and_remainder((video_files[0].video), params.duration)
			const audio_file = loop_audio(audio_files[0].audio, a_repeats)
			const video_file = loop_video(video_files[0].video, v_repeats)
			// merge to mp4
			return merge_audio_and_video(audio_file, video_file, params, output_path)
			// delete intermediate files
			fs.unlinkSync(audio_file)
			fs.unlinkSync(video_file)

		} else if (audio_files.length > 0 && 
			       video_files.length > 0 && 
			       video_files[0].hasOwnProperty('image')) {

			console.log(`Merging ${audio_files[0].audio} and ${video_files[0].video}`)

			output_path = merge_audio_and_image(audio_files[0].audio, video_files[0].image, params, output_path)
	
		} else if (audio_files.length === 0 && 
			       video_files.length > 0) {

			console.log(`\n Creating silent video with  ${video_files[0].video}`)
			
			// return create_silent_video(video_files[0].video, params, output_path) 
	
		} else {
			console.log('Error: bad input to ffmpeg')
		} 

	} catch(e) {
		console.log('Error: merging media files', e)
	}
}

function get_modified_pages_ids(pages_data) {
	try {
		const { STATE_FILE } = process.env

		let modified_pages_ids = []

		if (fs.existsSync(STATE_FILE)) {

			const state_file = fs.readFileSync(STATE_FILE, 'utf-8')

			if (!is_json_string(state_file)   ||
			    !is_valid_state(JSON.parse(state_file))) {

				modified_pages_ids = pages_data.map(page => page.meta.id)
				console.log('\nget_modified_pages_ids: state is not valid')
				console.log('\nModified pages ids:', modified_pages_ids)
				return modified_pages_ids
			}

			const cashed_pages = JSON.parse(state_file).pages

			// get modified pages
			pages_data.forEach(page => {
				cashed_pages.forEach(c_page => {
					if (page.meta.id === c_page.meta.id &&
						page.meta.last_edited_time !== c_page.meta.last_edited_time) {
						modified_pages_ids.push(page.meta.id)
					}
	 			})
			})

			// get new pages
			const new_pages_ids = pages_data.filter(page => {
				return cashed_pages.find(c_page => c_page.meta.id !== page.meta.id)
			}).map(page => page.meta.id)

			modified_pages_ids.concat(new_pages_ids)

		} else {
			// if no state file - process all pages
			modified_pages_ids = pages_data.map(page => page.meta.id)
		}

		console.log('\nModified pages ids:', modified_pages_ids)

		return modified_pages_ids

	} catch(e) {
		console.log('Can not get changed pages ids:', e)
	}
}


function generate_mp4s(pages_data, changed_pages_ids) {

	try {
		// if no pages changed just return pages_data with appended paths
		if (changed_pages_ids.length === 0) {
			console.log('\nNo pages changed or added, skiping generating mp4s...')
			return pages_data.map((page) => {
				return {
					...page,
					mp4: path.join(process.env.FFPLAYOUT_MEDIA_FOLDER, page.meta.id + '.mp4')
				}
			})
		}

		const pages_to_process = pages_data.filter(page => {
			return changed_pages_ids.find(id => page.meta.id === id)
		})

		return pages_to_process.map((page) => {

			const audio_files = []
			const video_files = []
			const output_path = path.join(process.env.FFPLAYOUT_MEDIA_FOLDER, page.meta.id + '.mp4')
			// TODO: better params handling
			const { play_time } = page
			const tags = page.meta.tags
			const params = {
				duration: page.meta.play_time.duration
			} 

			page.contents.map((block) => {

				if (block.type === 'video' || block.type === 'image') {
					video_files.push({[block.type]: block.file_path})

				} else if (block.type === 'audio') {
					audio_files.push({[block.type]: block.file_path})
				}
			})

			merge_page_media_files(audio_files, video_files, params, output_path)
			
			return {
				...page,
				mp4: output_path
			}
		})

	} catch (e) {
		console.log(e)
	}
}

function squash_playlist(ffplayout_playlist) {
	
	let index_time = 0
	const p = [] 
	let prev_entry = { source: '' }
	ffplayout_playlist.program.forEach((entry,i) => {

		if (prev_entry.source !== entry.source) {
			p.push({
				in: entry.in,
				out: entry.out,
				duration: entry.out,
				source: entry.source
			}) 
			index_time = 0

		} else {
			p[p.length-1].out = index_time + entry.duration
			p[p.length-1].duration = index_time + entry.duration
		}

		index_time += entry.duration
		prev_entry = entry 
	})

	ffplayout_playlist.program = p
	return ffplayout_playlist
}

function format_abs_secs_to_day_time(secs) {
	return moment.utc(moment.duration(secs+(6*3600), 'seconds').asMilliseconds()).format('HH:mm:ss')
}

function generate_daytime_playlist(squashed_playlist) {

	const daytime_playlist = []

	let prev_end = format_abs_secs_to_day_time(0)
	squashed_playlist.program.forEach(entry => {
		
		const start = prev_end 
		const end = format_abs_secs_to_day_time(entry.duration)
		prev_end = end

		daytime_playlist.push({
			...entry,
			start_daytime: start,
			end_daytime: end
		})
	})

	return daytime_playlist
}

function set_pages_playlist_dates(pages_data) {

	const pages_with_playlist_dates = []
	pages_data.forEach(page => {
		const page_start = page.meta.play_time.start
		const page_end   = page.meta.play_time.end

		let yyyy_mm_dd_start = new Date(page_start.split('T')[0])

		// if night hours of playlist
		if (new Date(page.meta.play_time.start).getHours() < 6) {
			yyyy_mm_dd_start = new Date(yyyy_mm_dd_start.setDate(yyyy_mm_dd_start.getDate()-1))
		}
		 																	    // +6 playlist -4 UTC
		const playlist_day_start = new Date(new Date(yyyy_mm_dd_start).getTime() + (2*60*60*1000))	
		const playlist_day_end   = new Date(new Date(yyyy_mm_dd_start).getTime() + (26*60*60*1000))

		if (new Date(page.meta.play_time.start) >= playlist_day_start &&
			new Date(page.meta.play_time.end) < playlist_day_end) {
			page.meta.play_time.playlist_day = yyyy_mm_dd_start.toISOString().split('T')[0]
		} else {
			console.log('\nset_page_playlist_day: out of range')
		}
		pages_with_playlist_dates.push(page)
	})

	return pages_with_playlist_dates
}


async function watch_playlist_changes() {
	const playlist_pages_meta = JSON.stringify(await get_playlist_pages_meta())
	let playlist_pages_meta_cash = ''

	if (fs.existsSync('playlist_pages_meta.json')) {
		playlist_pages_meta_cash = fs.readFileSync('playlist_pages_meta.json', 'utf-8')
	}

	// If playlist pages meta info changed - update ffplayout playlist
	if (playlist_pages_meta !== playlist_pages_meta_cash) {
		await update_ffplayout_playlist()
	}

	fs.writeFileSync("playlist_pages_meta.json", playlist_pages_meta)
}

function set_pages_duration(pages_data) {

	const today_yyyy_mm_dd = format(parseISO(formatISO(new Date())), "yyyy-MM-dd")
	const pages_without_play_time = []
	const pages_with_play_time = []

	pages_data.forEach(page => {
		if (!page.meta.play_time) {
			console.log(`\nNo play time selected for page with id ${page.meta.id}, skipping...`)
			pages_without_play_time.push(page) // TODO
			return 

		} else {
			abs_start  = new Date(page.meta.play_time.start).getTime() + 4*3600*1000
			abs_end    = new Date(page.meta.play_time.end).getTime() + 4*3600*1000
			page.meta.play_time.duration = (abs_end - abs_start)/1000
			// page.meta.play_time.abs_start  = get_time_interval_sec(page.meta.play_time.start,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
			// page.meta.play_time.abs_end    = get_time_interval_sec(page.meta.play_time.end,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
			pages_with_play_time.push(page)
		}
	})
	return pages_with_play_time
}

// function set_abs_start_and_end(pages_data) {

// 	const today_yyyy_mm_dd = format(parseISO(formatISO(new Date())), "yyyy-MM-dd")
// 	const pages_without_play_time = []
// 	const pages_with_play_time = []

// 	pages_data.forEach(page => {
// 		if (!page.meta.play_time) {
// 			console.log(`\nNo play time selected for page with id ${page.meta.id}, skipping...`)
// 			pages_without_play_time.push(page) // TODO
// 			return 

// 		} else {
// 			page.meta.play_time.abs_start  = new Date(page.meta.play_time.start).getTime() + 4*3600*1000
// 			page.meta.play_time.abs_end    = new Date(page.meta.play_time.end).getTime() + 4*3600*1000
// 			// page.meta.play_time.abs_start  = get_time_interval_sec(page.meta.play_time.start,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
// 			// page.meta.play_time.abs_end    = get_time_interval_sec(page.meta.play_time.end,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
// 			pages_with_play_time.push(page)
// 		}
// 	})
// 	return pages_with_play_time
// }

// function filter_pages_out_of_range(pages_data) {
// 	const today_yyyy_mm_dd = format(parseISO(formatISO(new Date())), "yyyy-MM-dd")
	
// 	return pages_data.filter(page => {
// 		if (page.meta.play_time.abs_start < 0) {
// 			console.log(`\nPage with id ${page.meta.id} is out of start point by ${page.meta.play_time.abs_start} sec`)
// 			return false  
// 		}
// 		if (page.meta.play_time.abs_end > 86400) {
// 			console.log(`\nPage with id ${page.meta.id} is out of end point by ${page.meta.play_time.abs_end - 86400} sec`)
// 			return false
// 		}
// 		return true
// 	})
// }




// function map_pages_to_playlist_dates(pages_data) {

// 	// find dates in pages data
// 	const dates = [...new Set(
// 			pages_data.map(page => page.meta.play_time.start.split('T')[0]
// 		)
// 	)]



// 	// get abs start of dates
// 	const playlist_offset = 6*3600*1000
// 	const abs_dates = dates.map(d => {
// 		return {
// 			date: d,
// 			abs_day_start: get_abs_day_start(d) + playlist_offset,
// 			abs_day_end:   get_abs_day_start(d) + playlist_offset + 86400000 
// 		}
// 	})

// 	// map pages to dates
// 	const pages_with_dates = []
// 	abs_dates.forEach(d => {
// 		pages_data.forEach(p => {

// 			page_start = p.meta.play_time.abs_start
// 			page_end   = p.meta.play_time.abs_end
// 			console.log('page_start', new Date(page_start))
// 			console.log('page_end', new Date(page_end))
// 			console.log('d.abs_day_start', new Date(d.abs_day_start))
// 			console.log('d.abs_day_end', new Date(d.abs_day_end))
// 			console.log('page_start >= d.abs_day_start', page_start >= d.abs_day_start)
// 			console.log('page_end   < d.abs_day_end', page_end   < d.abs_day_end)
// 			console.log('<', new Date(page_start) <= new Date(d.abs_day_start))
// 			if (page_start >= d.abs_day_start && 
// 				page_end   < d.abs_day_end)	{

// 					p.meta.play_time.playlist_day = d.date
// 					pages_with_dates.push(p)
// 			}

// 		})
// 	})
// 	console.log('pages_with_dates', pages_with_dates)
// 	return pages_with_dates
// }

function sort_pages_by_start_time(pages_data) {
	return pages_data.sort((page, next_page) => {
		return new Date(page.meta.play_time.start) - new Date(next_page.meta.play_time.start) 
	})
}

function add_placeholders(date, pages_data) {
	const { PLACEHOLDER_PATH } = process.env
	const pages_with_placeholders = []

	// let next_start
	let prev_end = 0
	const day_start  = new Date(date)
	day_start.setTime(day_start.getTime() + (6-4)*60*60*1000) // +6 playlist -4 UTC
	let duration = (new Date(pages_data[0].meta.play_time.start) - day_start)/1000

	pages_data.forEach((page, i) => {
		// console.log(page)
		let placeholder = {
			meta: {
				play_time: { 
					duration: duration,
					playlist_day: date
				}
			},
			mp4: PLACEHOLDER_PATH
		}

		if (duration > 0) {
			pages_with_placeholders.push(placeholder, page)
		}
			
		if ((i+1) < pages_data.length) {
			prev_end = placeholder.meta.play_time.duration + page.meta.play_time.duration
			const next_start = (new Date(pages_data[i+1].meta.play_time.start) - day_start)/1000
			duration = next_start - prev_end
		}
	})

	// add last placeholder to the end
	let duration_sum = 0
	pages_with_placeholders.forEach(page => duration_sum+=page.meta.play_time.duration)
	if (duration_sum < 86400) {
		pages_with_placeholders.push({
			meta: {
				play_time: {
					duration: 86400-duration_sum,
					playlist_day: date
				}		
			},
			mp4: PLACEHOLDER_PATH
		})
	}

	return pages_with_placeholders
}

function generate_playlists(pages_data) {
	// find dates in pages data
	const dates = [...new Set(
			pages_data.map(page => page.meta.play_time.playlist_day
		)
	)]

	const date_page_mapping = dates.map(date => {
		const date_pages = []
		pages_data.forEach(page => {
			if (page.meta.play_time.playlist_day === date){
				date_pages.push(page)
			}
		})

		return {
			date,
			pages: date_pages
		}
	})

	const date_page_mapping_with_placeholders = date_page_mapping.map(d => {
		return {
			date: d.date,
			pages: add_placeholders(d.date, d.pages)
		}
	})

	// Generate ffplayout playlist
	const playlists = date_page_mapping_with_placeholders.map(d => {
		return {
			program: d.pages.map(p => {
				return {
					in: 0,
					out: p.meta.play_time.duration,
					duration: p.meta.play_time.duration,
					source: p.mp4
				}
			}),
			date: d.date,
			channel: '1'
		}
	})
	return playlists
}

async function get_notion_pages_data() {
	const playlist_pages_meta = await get_playlist_pages_meta()
	const playlist_pages_data = await get_playlist_pages_data(playlist_pages_meta)
	return filter_pages_data(playlist_pages_data)
}

async function process_notion_pages_data(pages_data) {
	pages_data = await download_pages_files_if_not_exist(pages_data)
	pages_data = set_pages_duration(pages_data)
	pages_data = set_pages_playlist_dates(pages_data) //playlist range 24h 06:00-05:59
	const modified_pages_ids = get_modified_pages_ids(pages_data)
	pages_data = generate_mp4s(pages_data, modified_pages_ids)
	return sort_pages_by_start_time(pages_data)	
}

async function update_playlist(pages_data) {
	const playlists = generate_playlists(pages_data)
	playlists.forEach(async pllst => {
		await delete_ffplayout_playlist(pllst.date)
		await save_ffplayout_playlist(pllst)
	})
}

async function main() {
	// 1. Get data from Notion pages
	let pages_data = await get_notion_pages_data()

	// 2. Merge media files on each page to one mp4 file
	pages_data = await process_notion_pages_data(pages_data)

	await update_playlist(pages_data)

	// 3. Save notion pages state
	save_pages_state(pages_data)
}

main()