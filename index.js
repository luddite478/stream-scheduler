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
const { save_pages_state, get_modified_pages_ids } = require('./state')

const { merge_audio_and_video, 
		merge_audio_and_image,
		merge_audio, 
		loop_audio, 
		loop_video } = require('./ffmpeg')

const { download_file, 
		is_json_string, 
		get_time_interval_sec, 
		get_duration } = require('./utils')

const { save_ffplayout_playlist,
		delete_ffplayout_playlist,
		get_ffplayout_files_list,
		generate_playlists,
		set_pages_playlist_dates,
		reset_player_state,
		get_token } = require('./ffplayout')

const { get_playlist_pages_meta,
		get_page_contents,
		get_page,
		set_page_play_time,
		get_playlist_pages_data } = require('./notion')


const is_accepted_media_type = (type) => type === 'video' || type === 'audio' || type === 'image' || type === 'synced_block' || type === 'bookmark'
const filter_out_unneeded_block_data = (block) => {
	return {
		type: block.type,
		[block.type]: block[block.type],
		parent_page_id: block.parent.page_id,
		created_time: block.created_time
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
	const { name, ext } = path.parse(url_filename)
	return `${name}-row=${row}-created=${created_time}-p_id=${parent_page_id}${ext}`
}


function does_block_file_exist(filename) {
	const file_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
	return fs.existsSync(file_path)
}

async function download_pages_media_if_not_exist(playlist_pages_data) {
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
	console.log('\n*** Calculating repeats number to match target duration for file:\n',file)
	console.log('target duration:', target_duration)
	console.log('file duration:', file_duration)
	console.log('repeats:', repeats)
	console.log('remainder:', remainder)
	return { repeats, remainder }
}

function merge_page_media_files(audio_files, video_files, params, output_path) {

	try {
		// one video, one audio
		if (audio_files.length === 1 && 
		    video_files.length === 1 && 
		    video_files[0].hasOwnProperty('video')) { // TODO: add multiple files support

			const src_audio = audio_files[0].audio
			const src_video = video_files[0].video
			// loop to match duration
			const { repeats: a_repeats, 
				    remainder: a_remainder }  = get_number_of_repeats_and_remainder(src_audio, params.duration)
			const { repeats: v_repeats, 
				    remainder: v_remainder }  = get_number_of_repeats_and_remainder(src_video, params.duration)
			const audio_file = loop_audio(src_audio, a_repeats)
			const video_file = loop_video(src_video, v_repeats)
			// merge to mp4
			const result_mp4 = merge_audio_and_video(audio_file, video_file, params, output_path)
			// delete intermediate files
			fs.unlinkSync(audio_file)
			fs.unlinkSync(video_file)
			return result_mp4

		// multiple audio, one video
		} else if (
			audio_files.length > 1 && 
		    video_files.length === 1 && 
		    video_files[0].hasOwnProperty('video')) { 
			const src_video = video_files[0].video
			// loop to match duration
			const looped_audios = audio_files.map(({audio}) => {
				const { repeats: a_repeats, 
					    remainder: a_remainder }  = get_number_of_repeats_and_remainder(audio, params.duration)
				return loop_audio(audio, a_repeats)
			})
			// merge audio files
			const merged_audio = merge_audio(looped_audios)
			// loop video
			const { repeats: v_repeats, 
				    remainder: v_remainder }  = get_number_of_repeats_and_remainder(src_video, params.duration)
			const video_file = loop_video(src_video, v_repeats)
			// merge to result mp4
			const result_mp4 = merge_audio_and_video(merged_audio, video_file, params, output_path)
			// delete intermediate files
			looped_audios.forEach(audio => fs.unlinkSync(audio))
			fs.unlinkSync(merged_audio)
			fs.unlinkSync(video_file)
			return result_mp4

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

function generate_mp4s(pages_data, changed_pages_ids) {

	try {
		// if no modified pages return
		if (changed_pages_ids.length === 0) {
			console.log('\nNo pages changed or added, skiping generating mp4s...')
			return
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

			page.contents.forEach((block) => {

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
		console.log('generate_mp4s error:', e)
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
			pages_with_play_time.push(page)
		}
	})
	return pages_with_play_time
}


function sort_pages_by_start_time(pages_data) {
	return pages_data.sort((page, next_page) => {
		return new Date(page.meta.play_time.start) - new Date(next_page.meta.play_time.start) 
	})
}

function filter_outdated_pages(pages_data) {
	return pages_data.filter(page => {
		const playlist_day = new Date(page.meta.play_time.playlist_day)
		const playlist_day_start = new Date(new Date(playlist_day).getTime() + ((6-4)*60*60*1000))	
		const curr_day = new Date().toISOString().split('T')[0]
		const curr_day_start = new Date(new Date(curr_day).getTime() + ((6-4)*60*60*1000))
		return playlist_day_start >= curr_day_start 
	})
}

async function get_pages_data() {
	try {
		const pages_meta = await get_playlist_pages_meta()
		const pages_data = await get_playlist_pages_data(pages_meta)	
		return filter_pages_data(pages_data)
	} catch (e) {
		console.log('get_pages_data error:', e)
	}
}

async function process_pages_data(pages_data, modified_pages_ids) {
	try {
		pages_data = await download_pages_media_if_not_exist(pages_data)
		pages_data = set_pages_duration(pages_data)
		pages_data = set_pages_playlist_dates(pages_data) //playlist range 24h 06:00-05:59
		pages_data = filter_outdated_pages(pages_data)
		return generate_mp4s(pages_data, modified_pages_ids)
	} catch (e) {
		console.log('process_pages_data error:', e)
	}
}

async function update_playlists(pages_data, token) {
	try {
		pages_data = sort_pages_by_start_time(pages_data)
		const playlists = generate_playlists(pages_data)

		for (const pllst of playlists) {
			console.log(pllst)
			await delete_ffplayout_playlist(pllst.date, token)
			await save_ffplayout_playlist(pllst, token)
	  	}
	 } catch (e) {
		console.log('update_playlists error:', e)
	}
}

async function main() {
	// 1. Get data from Notion pages
	let pages_data = await get_pages_data()

	// 2. Get modified pages ids
	const modified_pages_ids = get_modified_pages_ids(pages_data)

	if (!modified_pages_ids.length) {
		return 
	}

	// 3. Process and merge media files on each page to one mp4 file
	new_pages_data = await process_pages_data(pages_data, modified_pages_ids)

	// 4. Update ffplayout playlist
	const token = await get_token()
	await update_playlists(new_pages_data, token)
	await reset_player_state(token)	

	// 5. Save program state as json
	save_pages_state(new_pages_data)

	// 6. Sleep 5 sec
	await new Promise(r => setTimeout(r, 5000))
}

// main()
setInterval(main, 10000)
