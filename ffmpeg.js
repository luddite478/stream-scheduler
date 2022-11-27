const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { discord_send } = require('./discord-bot')
const { get_codec_name } = require('./utils')

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

	    const log_msg = `\n*** Merging ${audio_file}\nand ${image_file}\nto ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (merge_audio_and_image):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not merge ${audio_file} and ${image_file}, error: `, e)
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

	    const log_msg = `\n*** Merging ${audio1_path}\nand ${video1_path}\nto ${output_path}`
    	console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (merge_audio_and_video):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not merge ${audio1_path} and ${video1_path}, error: `, e)
	}

}

function merge_audio(audio_files) {
	try {
		
		const basename = path.basename(audio_files[0])
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, '[multiple_audio]-' + basename)
		const inputs = audio_files.map(audio => {
			return ['-i', audio]
		}).flat()


		const args = [
	        '-hide_banner',
	        ...inputs,
	        '-filter_complex', `amix=inputs=${audio_files.length}:duration=longest:dropout_transition=3`,
	       	'-y',
	        output_path
	    ]

	    const log_msg = `\n*** Merging aduio files ${audio_files}\noutput file: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)
		
		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (merge_audio):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not merge audio files ${audio_files}, error: `, e)
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

	    const log_msg = `\n*** Applying fade in/out ${fade} sec for ${input_path}\noutput file: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (fadein_fadeout_audio):\n${proc.stderr.toString()}`)
		}

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


	    const log_msg = `\n*** Looping ${input_path}\nNumber of loops: ${repeats_number}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)
		fs.unlinkSync(tmp_concat_file)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (loop_audio):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not loop audio ${input_path}, error: `, e)
	}
}

function audio_reencode_aac(audio) {
	try {

		// apply micro fadein/fadeout
		const { name } = path.parse(audio)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, `[aac]-` + name + '.aac')

	    const log_msg = `\n*** Reencoding audio ${audio} to aac\noutput: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)

	    // Check if already aac 
	    const codec = get_codec_name(audio)
		if (codec === 'aac') {
			fs.renameSync(audio, output_path)
			return output_path
		}

	    const args = [
	        '-hide_banner',
	        '-i', audio,
	        '-c', 'aac',
	       	'-y',
	        `${output_path}`
	    ]

		const proc = spawnSync('ffmpeg', args)
		fs.unlinkSync(audio)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (audio_reencode_aac):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not reencode audio ${audio} to aac, error: `, e)
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

	    const log_msg = `\n*** Looping ${input_path}\nNumber of loops: ${repeats_number}\noutput: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)
		fs.unlinkSync(tmp_concat_file)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (loop_video):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not loop video ${input_path}, error: `, e)
	}
}

function merge_audio_and_color_image(audio_file, color='#121212') {
	try {
		
		const basename = path.basename(audio_file)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, '[audio_blank_image]-' + basename)

	    const args = [
	        '-hide_banner',
	        '-i', audio_file,
	        '-f', 'lavfi',
	        '-i', `color=c=${color}:s=1920x640:d=60:r=25,format=pix_fmts=yuv420p`,
	        '-vcodec', 'libx24',
	        '-acodec', 'aac',
	       	'-y',
	        output_path
	    ]

	    const log_msg = `\n*** Merging audio ${audio_file} and color ${color}: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (fadein_fadeout_audio):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not add fade to ${input_path}, error: `, e)
	}
}

function merge_audio_and_default_image(audio_file, resolution='1920x640') {
	try {
		
		const { name } = path.parse(audio_file)
		let dflt_image = fs.readdirSync('images/default')
			.filter(file => file.includes(resolution))
			.sort((a, b) => 0.5 - Math.random())[0]
		dflt_image = path.join('images/default', dflt_image)
		
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, '[audio_dflt_image]-' + name + '.mp4')
	    const args = [
	        '-hide_banner',
	        '-loop', '1',
	        '-i', dflt_image,
	        '-i', audio_file,
	        '-c:v', 'libx264', 
	        '-tune', 'stillimage',
	        '-acodec', 'copy',
	        '-shortest',
	       	'-y',
	        output_path
	    ]

	    const log_msg = `\n*** Merging audio ${audio_file}\nand default image ${dflt_image}\noutput: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)
		console.log(`\n${proc.stderr.toString()}`)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (merge_audio_and_default_image):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not merge audio and default image: `, e)
	}
}

function reencode_video(input_path) {
	try {
		
		const basename = path.basename(input_path)
		const output_path = path.join(process.env.TMP_MEDIA_FOLDER, '[reencode_video]-' + basename)
	    const args = [
	        '-hide_banner',
	        '-i', input_path,
	       	'-y',
	        output_path
	    ]

	    const log_msg = `\n*** Reencoding video ${input_path}\noutput: ${output_path}`
	    console.log(log_msg)
	    discord_send(log_msg)
		const proc = spawnSync('ffmpeg', args)

		if (proc.status !== 0) {
			console.log(`\n${proc.stderr.toString()}`)
			discord_send(`Error (reencode_video):\n${proc.stderr.toString()}`)
		}

		return output_path

	} catch(e) {
		console.log(`Can not add fade to ${input_path}, error: `, e)
	}
}


module.exports = {
	merge_audio_and_video,
	merge_audio_and_image,
	merge_audio_and_color_image,
	merge_audio_and_default_image,
	merge_audio,
	audio_reencode_aac,
	fadein_fadeout_audio,
	loop_audio,
	reencode_video,
	loop_video
}