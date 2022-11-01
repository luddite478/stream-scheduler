const { Client } = require("@notionhq/client")
const fs = require('fs')
require('dotenv').config()
const axios = require('axios')
const URL = require('url')
const path = require('path')
const moment = require('moment')
const { merge_audio_and_video, merge_audio_and_image } = require('./ffmpeg_merge')
const { get_duration } = require('./utils')

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})

async function get_playlist_pages_meta() {
	try {
	    const playlist_pages_meta = await notion.databases.query({
	    database_id: process.env.NOTION_DB_ID,
		    filter: {
				property: "tags",
		    	multi_select: {
		      		contains: "playlist"
		    	},
		  	},
		})

		return playlist_pages_meta.results

	} catch(e) {
		console.log(e)
	}
}

async function get_page_contents(id) {
	try {

	    const contents = await notion.blocks.children.list({
		    block_id: id
     	})

		return contents.results

	} catch(e) {
		console.log(e)
	}
}

async function get_page(id) {
	try {

	    const contents = await notion.pages.retrieve({
		    page_id: id
     	})

		return contents

	} catch(e) {
		console.log(e)
	}
}

const is_accepted_media_type = (type) => type === 'video' || type === 'audio' || type === 'image' || type === 'synced_block'
const filter_out_unneeded_block_info = (block) => {
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
				
				const contents = await get_page_contents(page_meta.id)
				const accepted_blocks = contents.filter((block) => is_accepted_media_type(block.type))
				const filtered_blocks = accepted_blocks.map((block) => filter_out_unneeded_block_info(block))

				return { 
					meta: { 
						id:	page_meta.id
					},
					contents: filtered_blocks
				}
			})
		)
	} catch(e) {
		console.log('get_playlist_pages_data error:', e)
	}
}


function extract_media_from_page(page) {
	const page_media = []
	page.contents.forEach((block) => {
		if (block.type === 'video') {
			page_media.push({
				page_id: page.meta.id,
				type: 'video',
				media: block.video.file.url
			})
		// TODO: add audio, etc
		}
	})

	return page_media
}


async function get_ffplayout_files_list() {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/file/1/browse/`,
			headers: { 
				'Authorization': `Bearer ${FFPAPI_TOKEN}`,
			},
			data: { 'source': '/' }
		})

		return res.data.files

	} catch (e) {
		console.log('get_ffplayout_files_list: error with code', e.response.status)
	}
}

function create_ffplayout_playlist(pages_data, total_duration=86400, params) {

	const playlist = []
	const duration_cash = [] // otherwise we need to call ffprobe every iteration
	let i = 0
	while (i < total_duration) {
		pages_data.forEach(page => {
			let page_with_duration = duration_cash.filter(mp4 => mp4.path === page.mp4)[0]
			
			let duraion
			if (!page_with_duration) {
				duration = get_duration(page.mp4)
				duration_cash.push({
					path: page.mp4,
					duration: duration
				})
			} else {
				duration = page_with_duration.duration
			}

			playlist.push({
				in: 0,
				out: duration,
				duration,
				source: page.mp4	
			})

			i+=duration
		})
	}

	return {
		channel: "1",
		date: moment().format('YYYY-MM-DD'),
		program: playlist
	}
}

async function download_file(fileUrl, outputLocationPath) {
 	const writer = fs.createWriteStream(outputLocationPath)

	return axios({
		method: 'get',
		url: fileUrl,
		responseType: 'stream',
	}).then(response => {

    //ensure that the user can call `then()` only when the file has
    //been downloaded entirely.
		return new Promise((resolve, reject) => {
			response.data.pipe(writer)
				let error = null
				writer.on('error', err => {
					error = err;
					writer.close();
					reject(err)
				})

				writer.on('close', () => {
					if (!error) {
						resolve(true)
					}
			//no need to call the reject here, as it will have been called in the
			//'error' stream;
			})
		})
	})
}

function create_ffplayout_filename(block, row) {
	const type = block.type
	const parent_page_id = block.parent_page_id
	const parsed_url = URL.parse(block[type].file.url, true)
	const created_time = moment(block.created_time).format('YYYYMMDD[T]HHmmss[Z]')
	const [ , , , url_filename ]  = parsed_url.pathname.split('/')
	const { name, ext} = path.parse(url_filename)
	return `${name}-row=${row}-created=${created_time}-p_id=${parent_page_id}${ext}`
}


function find_parent_page_id_by_filename(filename) {

}

async function download_pages_files_if_needed(ffplayout_files_list, playlist_pages_data) {
	try {
		// Download files from Notion if needed
		const block_files_to_download = []
		playlist_pages_data.map((page_data) => {
			page_data.contents.map((block, i) => {
				
				if (!Object.hasOwn(block[block.type], 'file')) {
					console.log('\nBlock is not a file')
				 	return
				}

				// Check if file exists on the disk
				const filename = create_ffplayout_filename(block, i+1)
				
				if (ffplayout_files_list.find((file) => file.name === filename)) {
					console.log(`\nFile ${filename} already exists`)
					return
				}
				
				const url = block[block.type].file.url
				const dst_path = path.join(process.env.TMP_MEDIA_FOLDER, filename)
				block_files_to_download.push({url, dst_path})
			})
		})	

		console.log(`\nGoing to download ${block_files_to_download.length} files`)
		await Promise.all(block_files_to_download.map(({ url, dst_path }) => download_file(url, dst_path)))
		console.log('\nFiles are successfully downloaded')	
		
		// Add file paths to pages contents info 
		return playlist_pages_data.map((page_data) => {
			return  {
				...page_data,
				contents: page_data.contents.map((block, i) => {
					return {
						...block,
						file_path: path.join(process.env.TMP_MEDIA_FOLDER, create_ffplayout_filename(block, i+1))
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
		if (audio_files.length > 0 && video_files.length > 0 && video_files[0].hasOwnProperty('video')) { // TODO: add multiple files support
			return merge_audio_and_video(audio_files[0].audio, video_files[0].video, params, output_path)

		} else if (audio_files.length > 0 && video_files.length > 0 && video_files[0].hasOwnProperty('image')) {
			console.log(`Merging ${audio_files[0].audio} and ${video_files[0].video}`)
			return merge_audio_and_image(audio_files[0].audio, video_files[0].image, params, output_path)
	
		} else if (audio_files.length === 0 && video_files.length > 0) {
			console.log(`Creating silent video with  ${video_files[0].video}`)
			return create_silent_video(video_files[0].video, params, output_path) 
	
		} else {
			console.log('Error: bad input to ffmpeg')
		} 

	} catch(e) {
		console.log('Error: merging media files', e)
	}
}


function create_mp4s_from_pages_data(playlist_pages_data) {

	try {

		return playlist_pages_data.map((page_data) => {

			const audio_files = []
			const video_files = []
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

async function save_ffplayout_playlist(ffplayout_playlist) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/playlist/1/`,
			headers: { 
				'Authorization': `Bearer ${FFPAPI_TOKEN}`,
			},
			data: ffplayout_playlist
		})

		console.log(res.data)

	} catch (e) {
		console.log('update_ffplayout_playlist: error with code', e)
	}
}

async function main() {
	// Get media from Notion pages
	const playlist_pages_meta = await get_playlist_pages_meta()
	const playlist_pages_data = await get_playlist_pages_data(playlist_pages_meta)
	const ffplayout_files_list  = await get_ffplayout_files_list()
	const playlist_pages_data_with_paths = await download_pages_files_if_needed(ffplayout_files_list, playlist_pages_data)
	// Merge media files on each page to 1 mp4 
	const pages_with_mp4s = create_mp4s_from_pages_data(playlist_pages_data_with_paths)
	// Generate and upload ffplayout playlist
	const ffplayout_playlist = create_ffplayout_playlist(pages_with_mp4s, 86400)
	await save_ffplayout_playlist(ffplayout_playlist)
}

main()
