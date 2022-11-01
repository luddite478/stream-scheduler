const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function merge_audio_and_image(audio_file, image_file, params, output_path) {

	try {
		let duration = ''
		if (params.duration) {
			duration =  `-t ${params.duration}` // TODO: add validation
		} else {
			shortest = '-shortest'
		}

		
	    const args = [
	        '-hide_banner',
	        '-i', image_file,
	        '-i', audio_file,
	        '-c:v', 'libx264',
	        '-tune', 'stillimage',
	        '-pix_fmt', 'yuv420p',
	       	duration,
	       	'-y',
	        output_path
	    ].filter(Boolean) 

	    console.log(`\nMerging ${audio_file}\nand ${image_file}\n  to ${output_path}`)
		const proc = spawnSync('ffmpeg', args)
		// const ffmpeg_stderr_path = path.join(__dirname, `ffmpeg_stderr.log`)

		console.log(`\n${proc.stderr.toString()}`)

		return output_path
			// proc.stderr.setEncoding("utf8")
			// proc.stderr.on('data', (data) => {
			// 	fs.appendFile(ffmpeg_stderr_path, data, (err) => {
	  //               if (err) {
	  //                   reject(err)
	  //               } 
	  //           })
	  //       })
			// console.log('here3')
			// proc.on('close', (code) => {
			// 	if (code === 0) {
			// 		console.log(`Merged ${audio1_path} and ${video1_path}`)	
			// 		resolve()
			// 	} else {
			// 		reject()
			// 	}
			// })
	
	} catch(e) {
		console.log(`Can not merge ${audio1_path} and ${video1_path}, error: `, e)
	}
}

function merge_audio_and_video(audio1_path, video1_path, params, output_path) {
	try {
			// 1. Audio shorter than video
		let shortest = ''
		let duration = ''
		if (params.duration) {
			duration =  `-t ${params.duration}` // TODO: add validation
		} else {
			shortest = '-shortest'
		}

	    const args = [
	        '-hide_banner',
	        '-stream_loop', '-1',
	        '-i', audio1_path,
	        '-i', video1_path,
	        '-map', '1:v:0',
	        '-map', '0:a:0',
	        shortest,
	       	duration,
	       	'-y',
	        output_path
	    ].filter(Boolean) 

	    console.log(`\nMerging ${audio1_path}\nand ${video1_path}\n  to ${output_path}`)
		const proc = spawnSync('ffmpeg', args)
		// const ffmpeg_stderr_path = path.join(__dirname, `ffmpeg_stderr.log`)

		console.log(`\n${proc.stderr.toString()}`)
		return output_path
		// proc.stderr.setEncoding("utf8")
		// proc.stderr.on('data', (data) => {
		// 	fs.appendFile(ffmpeg_stderr_path, data, (err) => {
  //               if (err) {
  //                   reject(err)
  //               } 
  //           })
  //       })
		// console.log('here3')
		// proc.on('close', (code) => {
		// 	if (code === 0) {
		// 		console.log(`Merged ${audio1_path} and ${video1_path}`)	
		// 		resolve()
		// 	} else {
		// 		reject()
		// 	}
		// })
			


	} catch(e) {
		console.log(`Can not merge ${audio1_path} and ${video1_path}, error: `, e)
	}

}

module.exports = {
	merge_audio_and_video,
	merge_audio_and_image
}