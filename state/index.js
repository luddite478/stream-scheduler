const fs = require('fs')
const { is_valid_state } = require('./validation')
const { is_json_string } = require('../utils')
const { discord_send } = require('../discord-bot')

function save_pages_state(pages_data) {

	const { STATE_FILE } = process.env

	let new_state = {}

	if (fs.existsSync(STATE_FILE) &&
		is_json_string(fs.readFileSync(STATE_FILE, 'utf-8')) &&
		is_valid_state(JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')))) {
		
		const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))

		new_state = {
			...state,
			pages: pages_data
		}

	} else {
		new_state = {
			pages: pages_data
		}
	}

	const json_new_state = JSON.stringify(new_state, null, 2)
	console.log(`\nSaving state to ${STATE_FILE}...`)
	fs.writeFileSync(STATE_FILE, json_new_state)
}

function get_state(pages_data, params=['last_edited_time']) {

	const { STATE_FILE } = process.env

	let new_state = {}
	
	if (fs.existsSync(STATE_FILE) &&
		is_json_string(fs.readFileSync(STATE_FILE, 'utf-8')) &&
		is_valid_state(JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')))) {
		
		const state_file = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))

		if(!state_file.pages.length) {
			return null
		}
		
		const state = state_file.pages.map(page =>{
			const { start, end, duration } = page.meta.play_time
			const { id, last_edited_time } = page.meta
			const { mp4 } = page
			
			return {
				id,
				start,
				end,
				duration,
				last_edited_time,
				mp4
			}
		})

		return state
	}
}

function get_modified_pages_ids(pages_data) {
	try {
		const { STATE_FILE } = process.env

		let modified_pages_ids = []

		if (fs.existsSync(STATE_FILE)) {

			const state_file = fs.readFileSync(STATE_FILE, 'utf-8')

			if (!is_json_string(state_file)   ||
			    !is_valid_state(JSON.parse(state_file)) ||
			    !JSON.parse(state_file).pages.length) {

				modified_pages_ids = pages_data.map(page => page.meta.id)
				console.log('\nget_modified_pages_ids: state is empty or not valid')
				// console.log('\nModified pages ids:', modified_pages_ids)
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
			const cashed_pages_ids = cashed_pages.map(page => page.meta.id)

			const new_pages_ids = []
			pages_data.forEach(page => {
				if (!cashed_pages_ids.find(id => id === page.meta.id)){
					new_pages_ids.push(page.meta.id)
				}
			})
			if (new_pages_ids) {
				modified_pages_ids = modified_pages_ids.concat(new_pages_ids)
			}
			
		} else {
			// if no state file - process all pages
			modified_pages_ids = pages_data.map(page => page.meta.id)
		}

		// console.log('\nModified pages ids:', modified_pages_ids)

		return modified_pages_ids

	} catch(e) {
		console.log('Can not get changed pages ids:', e)
	}
}

module.exports = {
	save_pages_state,
	get_modified_pages_ids,
	get_state
}