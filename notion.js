const { Client } = require("@notionhq/client")

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

async function set_page_play_time(id, date) {
	try {

	    const contents = await notion.pages.update({
		    page_id: id,
		    properties: {
      			'play time': {
		            'start': date.start,
		            'end': date.end
      			}
    		}
     	})

	} catch(e) {
		console.log(e)
	}
}

module.exports = {
	get_playlist_pages_meta,
	get_page_contents,
	get_page
}