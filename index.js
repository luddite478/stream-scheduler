const fs = require('fs')
require('dotenv').config()
const axios = require('axios')
const URL = require('url')
const path = require('path')
const moment = require('moment')
const momentDurationFormatSetup = require("moment-duration-format")
momentDurationFormatSetup(moment)

const { merge_audio_and_video, merge_audio_and_image } = require('./ffmpeg_merge')

const { download_file } = require('./utils')

const { save_ffplayout_playlist,
		delete_ffplayout_playlist,
		get_ffplayout_files_list, 
		generate_ffplayout_playlist } = require('./ffplayout')

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
						params: page_meta.properties.params.rich_text
					},
					contents: await get_page_contents(page_meta.id)
				}
			})
		)
	} catch(e) {
		console.log('get_playlist_pages_data error:', e)
	}
}

function filter_playlist_pages_data(playlist_pages_data) {

	try {
		return playlist_pages_data.map((page_data) => {
				
				// filter contents
				const { contents } = page_data
				const accepted_blocks = contents.filter((block) => is_accepted_media_type(block.type))
				const filtered_blocks = accepted_blocks.map((block) => filter_out_unneeded_block_data(block))
				return { 
					meta: { 
						id:	page_data.meta.id,
						...page_data.meta
					},
					contents: filtered_blocks
				}

			// filter empty pages
			}).filter(page_data => page_data.contents.length > 0)

	} catch(e) {
		console.log('filter_playlist_pages_data error:', e)
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


function does_block_file_exist(filename, ffplayout_files_list) {
	if (process.env.ENVIRONMENT === 'windows_dev') {
		const file_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
		return fs.existsSync(file_path)
	
	} else {
		return ffplayout_files_list.find((file) => file.name === filename)
	}	
}

async function download_pages_files_if_not_exist(ffplayout_files_list, playlist_pages_data) {
	try {
		// Download files from Notion if needed
		const block_files_to_download = []
		playlist_pages_data.map((page_data) => {
			page_data.contents.map((block, i) => {
				
				if (!Object.hasOwn(block[block.type], 'file')) {
					console.log('\nBlock is not a file')
				 	return
				}

				const filename = create_block_filename(block, i+1)

				// Check if file exists on the disk
				if (does_block_file_exist(filename, ffplayout_files_list)) {
					console.log(`\nFile ${filename} already exists`)
					return
				}
				
				const url = block[block.type].file.url
				const dst_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
				block_files_to_download.push({url, dst_path})
			})
		})	

		if (block_files_to_download.length > 0) {
			console.log(`\nGoing to download ${block_files_to_download.length} files`)
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

function merge_page_media_files(audio_files, video_files, params, output_path) {

	try {
		if (	   audio_files.length > 0 && 
		   		   video_files.length > 0 && 
		    	   video_files[0].hasOwnProperty('video')) { // TODO: add multiple files support

			return merge_audio_and_video(audio_files[0].audio, video_files[0].video, params, output_path)

		} else if (audio_files.length > 0 && 
			       video_files.length > 0 && 
			       video_files[0].hasOwnProperty('image')) {

			console.log(`Merging ${audio_files[0].audio} and ${video_files[0].video}`)

			return merge_audio_and_image(audio_files[0].audio, video_files[0].image, params, output_path)
	
		} else if (audio_files.length === 0 && 
			       video_files.length > 0) {

			console.log(`Creating silent video with  ${video_files[0].video}`)
			return create_silent_video(video_files[0].video, params, output_path) 
	
		} else {
			console.log('Error: bad input to ffmpeg')
		} 

	} catch(e) {
		console.log('Error: merging media files', e)
	}
}


function generate_mp4s(playlist_pages_data) {

	try {
		return playlist_pages_data.map((page_data) => {

			const audio_files = []
			const video_files = []
			const { play_time } = page_data
			const params = []
			const output_path = path.join(process.env.FFPLAYOUT_MEDIA_FOLDER, page_data.meta.id + '.mp4')
			page_data.contents.map((block) => {

				if (block.type === 'video' || block.type === 'image') {
					video_files.push({[block.type]: block.file_path})

				} else if (block.type === 'audio') {
					audio_files.push({[block.type]: block.file_path})
				}
			})

			merge_page_media_files(audio_files, video_files, params, output_path)

			return {
				...page_data,
				mp4: output_path
			}
		})

	} catch (e) {
		console.log(e)
	}
}

function squash_playlist(ffplayout_playlist, start_time='06:00:00.0', split_program=[]) {
	
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


async function update_ffplayout_playlist() {
	// 1. Get media from Notion pages
	const playlist_pages_meta            = await get_playlist_pages_meta()
	let   playlist_pages_data            = await get_playlist_pages_data(playlist_pages_meta)
	      playlist_pages_data            =       filter_playlist_pages_data(playlist_pages_data)
	const ffplayout_files_list           = await get_ffplayout_files_list()
	const playlist_pages_data_with_paths = await download_pages_files_if_not_exist(ffplayout_files_list, playlist_pages_data)

	// 2. Merge media files on each page to one mp4 file
	const pages_with_mp4s = generate_mp4s(playlist_pages_data_with_paths)
	
	// 3. Update ffplayout playlist
	const ffplayout_playlist = generate_ffplayout_playlist(pages_with_mp4s)
	await delete_ffplayout_playlist(moment().format('YYYY-MM-DD'))
	await save_ffplayout_playlist(ffplayout_playlist)

	// 4. Generate user-friendly playlist
	const squashed_playlist  = squash_playlist(ffplayout_playlist)
	const daytime_playlist   = generate_daytime_playlist(squashed_playlist)
	console.log(daytime_playlist)
}

async function main() {
	await update_ffplayout_playlist()
	// squash_playlist(playlist)
	// generate_playlist_program(playlist)
	// await set_page_play_time()
}

main()