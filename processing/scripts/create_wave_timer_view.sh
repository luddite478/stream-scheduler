# audio_input_path=$1
# tmp_folder=$2
tmp_folder="/mnt/c/projects/stream-scheduler/tmp"
audio_input_path="/mnt/c/users/user/Music/kraut.wav"
left_side_media_path="../../videos/flower800x800.mp4"
res1="800x800"
res2="1600x800"

showwaves_mode="cline"

ffmpeg -hide_banner -f lavfi -i "color=c=#121212:s=${res1}:d=60:r=25,format=pix_fmts=yuv420p" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t 1 -y "$tmp_folder/color_video.mp4"
ffmpeg -hide_banner -f lavfi -i "color=c=#cfb8be:s=${res2}:d=60:r=25,format=pix_fmts=yuv420p" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -filter_complex "[0:v]drawgrid=c=red@0.7:w=160:h=80:thickness=5[v]" -map '[v]' -t 1 -y "$tmp_folder/color_video2.mp4"
ffmpeg -hide_banner -i "$tmp_folder/color_video2.mp4" -vf "select=eq(n\,0)"  -y "$tmp_folder/color_pic2.png"
ffmpeg -hide_banner -i "$audio_input_path" -loop 1 -framerate 25 -i "$tmp_folder/color_pic2.png" -filter_complex "[0:a]aformat=channel_layouts=stereo,showwaves=s=2000x800:mode=${showwaves_mode}:r=25:colors=black[v];[1:v][v]overlay=format=auto:x=(W-w)/2:y=(H-h)/2,format=yuv420p[c_v_out]" -map "[c_v_out]" -map 0:a -c:v libx264 -c:a aac -shortest -y "$tmp_folder/waves.mp4"
ffmpeg -hide_banner -i "$left_side_media_path" -i "$tmp_folder/waves.mp4" -filter_complex "[0][1]scale2ref='oh*mdar':'if(lt(main_h,ih),ih,main_h)'[0s][1s];[1s][0s]scale2ref='oh*mdar':'if(lt(main_h,ih),ih,main_h)'[1s][0s];[0:a][1:a]amix=inputs=2[a];[0s][1s]hstack,setsar=1" -map "[a]" -y -ac 2 -preset veryfast "$tmp_folder/stack_video.mp4"
ffmpeg -hide_banner -i "$tmp_folder/stack_video.mp4" -vf "drawtext=text='timestamp: %{pts \: hms} / 2.51.60': fontsize=90:x=1600:y=500:fontcolor=yellow@0.9: box=1: boxcolor=black@0.6" -c:a copy -y "$tmp_folder/stack_timer.mp4"

# rm "$tmp_folder/color_pic2.png" 
# rm "$tmp_folder/color_video.mp4"
# rm "$tmp_folder/color_video2.mp4"
# rm "$tmp_folder/waves.mp4" 
# rm "$tmp_folder/stack_video.mp4"

duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -sexagesimal color_video.mp4)
