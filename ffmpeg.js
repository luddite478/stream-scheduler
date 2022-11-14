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

	    console.log(`\nMerging ${audio_file}\nand ${image_file}\nto ${output_path}`)
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
		let duration1 = ''
		let duration2 = ''
		if (params.duration) {
			duration1 =  `-t` // TODO: add validation
			duration2 =  `${params.duration}` 
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
	        '-acodec', 'aac',
	        '-vcodec', 'copy',
	        shortest,
	       	duration1, duration2,
	       	'-y',
	        output_path
	    ].filter(Boolean) 

	    console.log(`\nMerging ${audio1_path}\nand ${video1_path}\n  to ${output_path}`)
		const proc = spawnSync('ffmpeg', args)
		// const ffmpeg_stderr_path = path.join(__dirname, `ffmpeg_stderr.log`)


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

function fadein_fadeout_audio(input_path, fade=0.015) {
	try {
		
		const basename = path.basename(input_path)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, '[fadein_fadeout_audio]-' + basename)
	    const args = [
	        '-hide_banner',
	        '-i', input_path,
	        '-af', `afade=d=${fade},areverse,afade=d=${fade},areverse`,
	       	'-y',
	        output_path
	    ]

	    console.log(`\n*** Applying fade in/out ${fade} sec for ${input_path}\noutput file: ${output_path}`)
		const proc = spawnSync('ffmpeg', args)

		return output_path

	} catch(e) {
		console.log(`Can not add fade to ${input_path}, error: `, e)
	}
}


function loop_audio(input_path, repeats_number) {
	try {
		// apply micro fadein/fadeout
		const faded_audio = fadein_fadeout_audio(input_path)
		// create txt file fo concatenation
		const tmp_concat_file = path.join(process.env.TMP_MEDIA_FOLDER,'concat.txt')

		let concat_str = ``
		for (i=0;i<repeats_number;i++) {
			concat_str+=`file '${faded_audio}'\n`
		}

		const basename = path.basename(faded_audio)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, `[loop_audio-${repeats_number}]-` + basename)

		fs.writeFileSync(tmp_concat_file, concat_str)

	    const args = [
	        '-hide_banner',
	        '-f', 'concat', 
	        '-safe', '0',
	        '-i', tmp_concat_file,
	        '-c', 'copy',
	       	'-y',
	        `${output_path}`
	    ]

	    console.log(`\nLooping ${input_path}\nNumber of loops: ${repeats_number} `)
		const proc = spawnSync('ffmpeg', args)
		fs.unlinkSync(tmp_concat_file)

		// console.log(`\n${proc.stderr.toString()}`)
		return output_path

	} catch(e) {
		console.log(`Can not loop audio ${input_path}, error: `, e)
	}
}

function loop_video(input_path, repeats_number) {
	try {
		// create txt file fo concatenation
		const tmp_concat_file = path.join(process.env.TMP_MEDIA_FOLDER,'concat.txt')
		const basename = path.basename(input_path)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, `[loop_video-${repeats_number}]-` + basename)

		let concat_str = ``
		for (i=0;i<repeats_number;i++) {
			concat_str+=`file '${input_path}'\n`
		}

		fs.writeFileSync(tmp_concat_file, concat_str)

	    const args = [
	        '-hide_banner',
	        '-f', 'concat', 
	        '-safe', '0',
	        '-i', tmp_concat_file,
	        '-c', 'copy',
	       	'-y',
	        `${output_path}`
	    ]

	    console.log(`\nLooping ${input_path}\nNumber of loops: ${repeats_number} `)
		const proc = spawnSync('ffmpeg', args)
		fs.unlinkSync(tmp_concat_file)

		// console.log(`\n${proc.stderr.toString()}`)
		return output_path

	} catch(e) {
		console.log(`Can not loop video ${input_path}, error: `, e)
	}
}

module.exports = {
	merge_audio_and_video,
	merge_audio_and_image,
	fadein_fadeout_audio,
	loop_audio,
	loop_video
}