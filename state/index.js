const fs = require('fs')
const { is_valid_state } = require('./validation')
const { is_json_string } = require('../utils')

function save_pages_state(pages_data) {

	const { STATE_FILE } = process.env

	let new_state = {}

	if (fs.existsSync(STATE_FILE) &&
		is_json_string(STATE_FILE) &&
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

module.exports = {
	save_pages_state
}