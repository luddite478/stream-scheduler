const { Client } = require("@notionhq/client")
const fs = require('fs')
require('dotenv').config()
const axios = require('axios')
const URL = require('url')
const path = require('path')

// Initializing a client
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
const filter_out_unneded_block_info = (block) => {
	return {
		type: block.type,
		[block.type]: block[block.type],
		parent_page_id: block.parent.page_id
	}
}

async function get_playlist_pages_data(playlist_pages_meta) {
	return await Promise.all(
		playlist_pages_meta.map(async (page_meta) => {
			
			const contents = await get_page_contents(page_meta.id)
			const accepted_blocks = contents.filter((block) => is_accepted_media_type(block.type))
			const filtered_blocks = accepted_blocks.map((block) => filter_out_unneded_block_info(block))

			return { 
				meta: { 
					id:	page_meta.id
				},
				contents: filtered_blocks
			}
		})
	)
}

// 	// const page = { 
// 	// 	id: id,
// 	// 	videos: []
// 	// }

// 	// page_contents.forEach((block) => {

// 	// 	if (block.type === 'video') {
// 	// 		page.videos.push(block.video.file.url)
// 	// 	}
// 	// })
// 	// console.log('playlist_pages', playlist_pages)

// 	// return playlist_pages
// }

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

function parse_playlist_pages_data(playlist_pages) {
	const pages_media_playlist = []
	playlist_pages.forEach((page) => {
		// console.log(page)
		// const page_id = page.meta.id
		// const page_media_files = extract_media_from_page(page)
	})

	return pages_media_playlist
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

function create_ffplayout_playlist(playlist) {
	const sources = playlist.map((entry) => {
		return {
			in: 0,
			out: 700,
			duration: 700,
			source: entry.video
		}
	})

	return JSON.stringify({
		channel: "Test 1",
		date: "2022-10-28",
		source: sources
	})
}

async function download_file(fileUrl, outputLocationPath) {
  const writer = fs.createWriteStream(outputLocationPath);

  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  }).then(response => {

    //ensure that the user can call `then()` only when the file has
    //been downloaded entirely.

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error = null;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) {
          resolve(true);
        }
        //no need to call the reject here, as it will have been called in the
        //'error' stream;
      });
    });
  });
}

function create_ffplayout_filename(block) {
	const type = block.type
	const parent_page_id = block.parent_page_id
	const parsed_url = URL.parse(block[type].file.url, true)
	const [ , , , url_filename ]  = parsed_url.pathname.split('/')
	const { name, ext} = path.parse(url_filename)
	return `${name}-${parent_page_id}${ext}`
}

function find_parent_page_by_filename(filename) {

}

async function download_notion_files_if_needed(ffplayout_files_list, playlist_pages_data) {

	try {
		const block_files_to_download = []
		playlist_pages_data.map((page_data) => {
			page_data.contents.map((block) => {
				
				if (!Object.hasOwn(block[block.type], 'file')) {
					console.log('Block is not a file')
				 	return
				}

				// Check if file exists
				const filename = create_ffplayout_filename(block)
				if (ffplayout_files_list.find((file) => file.name === filename)) {
					console.log(`File ${filename} already exists`)
					return
				}
				
				const url = block[block.type].file.url
				const dst_path = path.join(process.env.FFPLAYOUT_MEDIA_FOLDER, filename)
				block_files_to_download.push({url, dst_path})
			})
		})	

		console.log('Going to download files: \n', block_files_to_download)
		await Promise.all(block_files_to_download.map(({ url, dst_path }) => download_file(url, dst_path)))
		console.log('\nFiles are successfully downloaded\n')	
	
	} catch(e) {
		console.log('Error while downloading Notion files: ', e)
	}

}

async function main() {
	const playlist_pages_meta = await get_playlist_pages_meta()
	const playlist_pages_data = await get_playlist_pages_data(playlist_pages_meta)
	let ffplayout_files_list = await get_ffplayout_files_list()
	await download_notion_files_if_needed(ffplayout_files_list, playlist_pages_data)
	ffplayout_files_list = await get_ffplayout_files_list()
}

main()
