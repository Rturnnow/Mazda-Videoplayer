/*
 *
 * v2.0 Initial Version
 * v2.1 Included more video types
 * v2.2 Enabled the fullscreen Option
 * v2.3 Included the status bar and adjusts to play in a window
 * v2.4 Included a shuffle option
 *		fixed the problem of pressing the next button rapidly
 *		The list updates automaticaly at start
 * v2.5 It can now logs the steps (have to enable it on the videoplayer-v2.js & videoplayer.sh files)
 *		closes the app if is not the current (first attempt)
 *		fixes the issue of pressing mutiple times the search video button
 *		fixes the application not showing the controls again when a video play fails
 *		fixes playing the same video when shuffle is active
 *		starts using a swap file on start of the app if not running (still have to create the swap with the AIO)
 * v2.6 Change gst-launch for gplay, incorporing pause, resume, rw, ff
 *		Direct send of commands to sh (Better control)
 *		Close of WebSocket as it should be (saves memory)
 *		Change of port 55555 to 9998 in order to avoid problems with some cmu processes
 *		Bugfix for files with more than one consecutive white space
 *		Most of the times it stops the video when you put reverse with no problems
 * v2.7 Include pause when touching the video in the center, rewind when touching the left side and Fast Forward when touching the right side. (15% of the screen each)
 *			Correct problem when stopping a paused video (the icon shows an incorrect image at the beginning of the next video)
 * v2.8 |----------------------------------------------------------------------------------------------|
 *		|- Multicontroller support ----- [In Video List] ------------ [During Playback] ---------------|
 *		|----------------------------------------------------------------------------------------------|
 *		|- Press command knob ---------- [Select video] ------------- [Play/pause] --------------------|
 *		|- Tilt up --------------------- [Video list pgup] ---------- [Toggle fullscreen(next video)] -|
 *		|- Tilt down ------------------- [Video list pgdn] ---------- [Stop] --------------------------|
 *		|- Tilt Right ------------------ [Toggle shuffle mode] ------ [Next] --------------------------|
 *		|- Tilt left ------------------- [Toggle repeat all] -------- [Previous] ----------------------|
 *		|- Rotate command knob CCW/CW -- [Scroll video list up/dn] -- [RW/FF (10 seconds)] ------------|
 *		|----------------------------------------------------------------------------------------------|
 *		Lowered RW/FF time from 30s => 10s for beter control with command knob rotation
 *		Change method of managing the video list to jquery instead of bash
 *		Avoid problems when using files with ', " or other special characters. You must remove this character from your video name
 *		Use of the command knob to control the playback and to select the videos
 *		Use of the websocketd file provided by diginix
 *		Previous video option
*		Option to select the playback option with the commander (tilt left or right)
 * v2.9 Repeat All option: Keep track of recently played videos so videos aren't repeated until the entire list is played.
 *		Toggling repeat 1/all or shuffle OFF resets recentlyPlayed list; shuffle ON, stopping playback, and rebooting do not.
 *		After last video in the list is played, jumps to the first video in the list.
 *		User variables are saved to localStorage: shuffle, repeat 1, repeat all, fullscreen, and recently played list.
 *		Option to select the playback option with the commander (tilt left or right)
 * TODO:
 *		Get the time from gplay instead of the javascript in order to FF or RW more accurately
 *		Get Errors from gplay
 *		Change the audio input and stop the music player. If just mutes the player the system lags when playing
 *		Complete the plugins in the cmu in order to allow more file types and fullscreen toggle
 */
var enableLog = false;

//var folderPath='/home/victor/Videos1';
var folderPath='/tmp/mnt';
var currentVideoTrack = null;
var Repeat = JSON.parse(localStorage.getItem('videoplayer.repeat')) || false;
var FullScreen =  JSON.parse(localStorage.getItem('videoplayer.fullscreen')) || false;
var Shuffle = JSON.parse(localStorage.getItem('videoplayer.shuffle')) || false;
var RepeatAll = JSON.parse(localStorage.getItem('videoplayer.repeatall')) || false;
var currentVideoListContainer = 0;
var totalVideoListContainer = 0;
var waitingWS = false;
var waitingForClose=false;
var totalVideos = 0;
var intervalVideoPlayer;
var VideoPaused = false;
var CurrentVideoPlayTime = -5; //The gplay delays ~5s to start
var TotalVideoTime = null;
var intervalPlaytime;
var waitingNext = false;
var selectedItem = 0;
var recentlyPlayed = JSON.parse(localStorage.getItem('videoplayer.recentlyplayed')) || [];
var selectedOptionItem = -1; //6 ??

//var logFile = "/tmp/mnt/sd_nav/video-log.txt";
var logFile = "/jci/gui/apps/_videoplayer/videoplayer_log.txt";
var boxChecked = 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoCheckedBox.png)';
var boxUncheck = 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoUncheckBox.png)';

var src = '';

var wsVideo = null;

$(document).ready(function(){
	try
	{
		$('#SbSpeedo').fadeOut();
		/*
		*  Trick: When opening videoplayer, press the music button right away.
		*  While switching contexts the pause command will execute and music will be paused.
		*  Then switch back to videoplayer and play a video.
		*  This is a temporary solution untill a better one is discovered.
		*/
		framework.sendEventToMmui("common", "Global.Pause");
	}
	catch(err)
	{

	}
	setCheckBoxes('#myVideoFullScrBtn', FullScreen);
	setCheckBoxes('#myVideoShuffleBtn', Shuffle);
	setCheckBoxes('#myVideoRepeatBtn', Repeat);
	setCheckBoxes('#myVideoRepeatAllBtn', RepeatAll);
	function setCheckBoxes(opId, checkIt) {
		var check = (checkIt) ? boxChecked : boxUncheck;
		$(opId).css({'background-image': check});
	}
	if (JSON.parse(localStorage.getItem('videoplayer.background'))) {$('#myVideoContainer').addClass('noBg');}
	//	if (window.File && window.FileReader && window.FileList && window.Blob) {
	//		$('#myVideoList').html("step 1");
	//	}
	if (enableLog)
	{
		myVideoWs('mount -o rw,remount /; hwclock --hctosys; ', false); //enable-write - Change Date

		writeLog("\n---------------------------------------------------------------------------------\napp start\nStart App Config\n====creating swap====");
	}

	src = 'USBDRV=$(ls /mnt | grep sd); ' +

		'for USB in $USBDRV; ' +
		'do ' +
		'USBPATH=/tmp/mnt/${USB}; ' +
		'SWAPFILE="${USBPATH}"/swapfile; ' +
		'if [ -e "${SWAPFILE}" ]; ' +
		'then ' +
		'mount -o rw,remount ${USBPATH}; ' +
		'mkswap ${SWAPFILE};' +
		'swapon ${SWAPFILE}; ' +
		'break; ' +
		'fi; ' +
		'done; ';

	if (enableLog)
	{
		src = src + 'cat /proc/swaps >> '+ logFile +'; ';
	}

	myVideoWs(src, false); //start-swap

	/* reboot system
	==================================================================================*/
	$('.rebootBtnDiv').click(function(){
		writeLog("rebootBtn Clicked");
		myRebootSystem();
	});

	/* retrieve video list
	==================================================================================*/
	$('#myVideoMovieBtn').click(function(){
		writeLog("myVideoMovieBtn Clicked");
		myVideoListRequest();
	});

	/* scroll up video list
	==================================================================================*/
	$('#myVideoScrollUp').click(function(){
		writeLog("myVideoScrollUp Clicked");
		myVideoListScrollUpDown('up');
	});

	/* scroll down video list
	==================================================================================*/
	$('#myVideoScrollDown').click(function(){
		writeLog("myVideoScrollDown Clicked");
		myVideoListScrollUpDown('down');
	});

	/* play pause playback
	==================================================================================*/
	$('#myVideoPausePlayBtn').click(function(){
		writeLog("myVideoPausePlayBtn Clicked");
		myVideoPausePlayRequest();
	});
	$('#videoPlayBtn').click(function(){
		writeLog("videoPlayBtn Clicked");
		myVideoPausePlayRequest();
	});

	/* FullScreen playback
	==================================================================================*/
	$('#myVideoFullScrBtn').click(function(){
		writeLog("myVideoFullScrBtn Clicked");
		if(FullScreen){
			FullScreen = false;
			$('#myVideoFullScrBtn').css({'background-image' : boxUncheck});
		}
		else {
			FullScreen = true;
			$('#myVideoFullScrBtn').css({'background-image' : boxChecked});
		}
		localStorage.setItem('videoplayer.fullscreen', JSON.stringify(FullScreen));
	});

	/* stop playback
	==================================================================================*/
	$('#myVideoStopBtn, #videoStopBtn').click(function(){
		writeLog("myVideoStopBtn Clicked");
		myVideoStopRequest();
	});

	/* start playback
	==================================================================================*/
	$('#myVideoList').on("click", "li", function() {
		writeLog("myVideoList Clicked");
		myVideoStartRequest($(this));
	});

	/* next track
	==================================================================================*/
	$('#myVideoNextBtn, #videoNextBtn').click(function(){
		writeLog("myVideoNextBtn Clicked");
		myVideoNextRequest();
	});

	/* previous track
	==================================================================================*/
	$('#myVideoPreviousBtn, #videoPrevBtn').click(function(){
		writeLog("myVideoPreviousBtn Clicked");
		myVideoPreviousRequest();
	});

	/* FF
	==================================================================================*/
	$('#myVideoFF').click(function(){
		writeLog("myVideoFF Clicked");
		myVideoFFRequest();
	});
	$('#videoPlayFFBtn').click(function(){
		writeLog("videoPlayFFBtn Clicked");
		myVideoFFRequest();
	});

	/* RW
	==================================================================================*/
	$('#myVideoRW').click(function(){
		writeLog("myVideoRW Clicked");
		myVideoRWRequest();
	});
	$('#videoPlayRWBtn').click(function(){
		writeLog("videoPlayRWBtn Clicked");
		myVideoRWRequest();
	});

	/* repeat option (looping single track)
	==================================================================================*/
	$('#myVideoRepeatBtn').click(function(){
		writeLog("myVideoRepeatBtn Clicked");
		if(Repeat){
			Repeat = false;
			$('#myVideoRepeatBtn').css({'background-image' : boxUncheck});
		} else {
			Repeat = true;
			$('#myVideoRepeatBtn').css({'background-image' : boxChecked});
		}
		recentlyPlayed = [];
		writeLog("recentlyPlayed Reset");
		localStorage.setItem('videoplayer.repeat', JSON.stringify(Repeat));
	});

	/* repeat all option (loop entire video list)
	==================================================================================*/
	$('#myVideoRepeatAllBtn, #videoReAllBtn').click(function(){
		writeLog("myVideoRepeatAllBtn Clicked");
		if(RepeatAll){
			RepeatAll = false;
			$('#myVideoRepeatAllBtn').css({'background-image' : boxUncheck});
		} else {
			RepeatAll = true;
			$('#myVideoRepeatAllBtn').css({'background-image' : boxChecked});
		}
		recentlyPlayed = [];
		writeLog("recentlyPlayed Reset");
		localStorage.setItem('videoplayer.repeatall', JSON.stringify(RepeatAll));
	});

	/* Shuffle option
	==================================================================================*/
	$('#myVideoShuffleBtn, #videoShuffleBtn').click(function(){
		writeLog("myVideoShuffleBtn Clicked");
		if(Shuffle)
		{
			Shuffle = false;
			$('#myVideoShuffleBtn').css({'background-image' : boxUncheck});
			recentlyPlayed = [];
			writeLog("recentlyPlayed Reset");
		}
		else
		{
			Shuffle = true;
			$('#myVideoShuffleBtn').css({'background-image' : boxChecked});
		}
		localStorage.setItem('videoplayer.shuffle', JSON.stringify(Shuffle));
	});

	/* Toggle Background Button
	==================================================================================*/
	$('#toggleBgBtn').click(function(){
		$('#myVideoContainer').toggleClass('noBg');
		localStorage.setItem('videoplayer.background', JSON.stringify($('#myVideoContainer').hasClass('noBg')));
	});

	setTimeout(function () {
		//writeLog("setTimeout started");
		myVideoListRequest();
		/* if (recentlyPlayed.length > 0)
		{
			selectedItem = recentlyPlayed[recentlyPlayed.length -1];
			selectedItem++;
			currentVideoListContainer = Math.floor(selectedItem / 8);
			handleCommander("ccw");
		} */
	}, 500);


	//try to close the video if the videoplayer is not the current app
	intervalVideoPlayer = setInterval(function () {
		//writeLog("setInterval intervalVideoPlayer - " + framework.getCurrentApp());

		if ((!waitingForClose) && (framework.getCurrentApp() !== '_videoplayer'))
		{
			clearInterval(intervalPlaytime);
			clearInterval(intervalVideoPlayer);

			writeLog("Closing App - New App: " + framework.getCurrentApp());
			waitingForClose = true;
			myVideoStopRequest();

			if (enableLog === true)
			{
				myVideoWs('mount -o ro,remount /', false); //disable-write
			}

		}
	}, 1);//some performance issues ??
});



// try not to make changes to the lines below

// Start of Video Player
// #############################################################################################


/* reboot system
==========================================================================================================*/
function myRebootSystem(){
	writeLog("myRebootSystem called");
	myVideoWs('reboot', false); //reboot
}


/* video list request / response
==========================================================================================================*/
function myVideoListRequest(){
	writeLog("myVideoListRequest called");
	if (!waitingWS)
	{
		waitingWS=true;
		currentVideoListContainer = 0;
		$('#myVideoScrollUp').css({'visibility' : 'hidden'});
		$('#myVideoScrollDown').css({'visibility' : 'hidden'});
		$('#toggleBgBtn').css({'visibility' : 'hidden'});
		$('#myVideoList').html("<img id='ajaxLoader' src='apps/_videoplayer/templates/VideoPlayer/images/ajax-loader.gif'>");


		writeLog("Start List Recall");


		if (enableLog)
		{
			src = src + 'echo "====retrieve list start====" >> '+logFile+'; ';
		}

		src = 'MNTFOLDER=\'' + folderPath + '\'; ';
		src = src + 'FILES=$(ls -d -1 $MNTFOLDER/sd*/Movies/** | egrep ".avi|.mp4|.wmv|.flv"); ';
		src = src + 'FILES=$(echo "$FILES" | tr \'\n\' \'|\'); ';


		src = src + 'echo playback-list#"${FILES}"';

		writeLog(src);
		myVideoWs(src, true); //playback-list
	}

}

function myVideoListResponse(data){
	writeLog("myVideoListResponse called");

	waitingWS=false;

	var videoList = $("#myVideoList");
	videoList.html("");

	var videos = data.split("|");
	videos.splice(videos.length - 1);
	totalVideoListContainer = 1;

	if(videos[0] === ""){
		writeLog("No videos found");
		videoList.html('No videos found<br/><br/>Tap <img src="apps/_videoplayer/templates/VideoPlayer/images/myVideoMovieBtn.png" style="margin-left:8px; margin-right:8px" /> to search again');
	}
	else
	{

		writeLog("myVideoList insert data --- " + data);

		videoList.append($('<ul id="ul' + totalVideoListContainer + '"></ul>')
		.addClass("videoListContainer"));
		videoListUl = $("#ul" + totalVideoListContainer);

		videos.forEach(function(item, index){

			if ((index > 0 ) && (index) % 8 === 0)
			{
				totalVideoListContainer++;
				videoList.append($('<ul id="ul' + totalVideoListContainer + '"></ul>')
				.addClass("videoListContainer"));
				videoListUl = $("#ul"+totalVideoListContainer);

			}
			var videoName = item.replace(folderPath, '');
			videoName = videoName.substring(videoName.search(/\/movies\//i) + 8);

			videoListUl.append($('<li></li>')
			.attr({
				'video-name': videoName,
				'video-data': item
			})
			.addClass('videoTrack')
			.html(index + 1 + ". " + videoName.replace(/  /g, " &nbsp;")));

		});

		totalVideos = videos.length;
		selectedItem=1;
		handleCommander("ccw");
		$('#toggleBgBtn').css({'visibility' : 'visible'});

		if(totalVideoListContainer > 1)
		{
			$('#myVideoScrollDown').css({'visibility' : 'visible'});
		}
	}
}


/* video list scroll up / down
==========================================================================================================*/
function myVideoListScrollUpDown(action){
	writeLog("myVideoListScrollUpDown called");

	switch(action) {
		case 'up':
		currentVideoListContainer--;
		break;
		case 'down':
		currentVideoListContainer++;
		break;
		case 'top':
		currentVideoListContainer = 0;
		break;
		case 'bottom':
		currentVideoListContainer = totalVideoListContainer -1;
		break;
	}

	if(currentVideoListContainer === 0){
		$('#myVideoScrollUp').css({'visibility' : 'hidden'});
	} else { // if(currentVideoListContainer > 0)
		$('#myVideoScrollUp').css({'visibility' : 'visible'});
	}

	if(currentVideoListContainer === totalVideoListContainer - 1){
		$('#myVideoScrollDown').css({'visibility' : 'hidden'});
	} else { // if(currentVideoListContainer < totalVideoListContainer - 1)
		$('#myVideoScrollDown').css({'visibility' : 'visible'});
	}

	$('.videoListContainer').each(function(index){
		$(this).css({'display' : 'none'});
	});

	$(".videoListContainer:eq(" + currentVideoListContainer + ")").css("display", "");
	$('#toggleBgBtn').css({'visibility' : 'visible'});

}


/* start playback request / response
==========================================================================================================*/
function myVideoStartRequest(obj){
	writeLog("myVideoStartRequest called");

	currentVideoTrack = $(".videoTrack").index(obj);
	var videoToPlay = obj.attr('video-data');
	$('#myVideoName').html('Preparing to play...');
	$('#myVideoName').css({'display' : 'block'});
	$('#myVideoStatus').css({'display' : 'block'});
	writeLog("Recently Played: " + recentlyPlayed);

	waitingNext = false;

	writeLog("myVideoStartRequest - Video #" + currentVideoTrack + ": " + videoToPlay);

	if (recentlyPlayed.indexOf(currentVideoTrack) === -1)
	{
		recentlyPlayed.push(currentVideoTrack);
		writeLog("Add Track " + currentVideoTrack + " to recentlyPlayed list");
	}
	//myVideoWs('killall gplay', false); //start-playback

	//writeLog("myVideoStartRequest - Kill gplay");

	//myVideoWs('sync && echo 3 > /proc/sys/vm/drop_caches; ', false); //start-playback
	myVideoWs('sync; for n in 0 1 2 3; do echo $n > /proc/sys/vm/drop_caches; done;', false);

	$('#myVideoList').css({'visibility' : 'hidden'});
	$('#myVideoScrollDown').css({'visibility' : 'hidden'});
	$('#myVideoScrollUp').css({'visibility' : 'hidden'});
	$('#toggleBgBtn').css({'visibility' : 'hidden'});


	$('#myVideoShuffleBtn').css({'display' : 'none'});
	$('#myVideoMovieBtn').css({'display' : 'none'});
	$('#myVideoFullScrBtn').css({'display' : 'none'});
	$('#myVideoRepeatBtn').css({'display' : 'none'});
	$('#myVideoRepeatAllBtn').css({'display' : 'none'});
	$('.rebootBtnDiv').css({'display' : 'none'});

	$('#myVideoPreviousBtn').css({'display' : ''});
	$('#myVideoRW').css({'display' : ''});
	$('#myVideoPausePlayBtn').css({'display' : ''});
	$('#myVideoFF').css({'display' : ''});
	$('#myVideoNextBtn').css({'display' : ''});
	$('#myVideoStopBtn').css({'display' : ''});
	$('#myVideoName').html(obj.attr('video-name').replace(/ /g, "&nbsp;"));

	//$('.videoTouchControls').show();
	//$('#videoPlayControl').css({'display' : 'block'});
	$('#videoPlayControl').css('cssText', 'display: block !important');
	$('#videoPlayBtn').css({'background-image' : ''});


	try
	{
		src = 'sleep 0.3; ';

		writeLog('start playing');

		writeLog(videoToPlay);

		//Screen size 800w*480h
		//Small screen player 700w*367h

		src = src + '/usr/bin/gplay --video-sink="mfw_v4lsink';

		if (!FullScreen)
		{
			src = src + ' disp-width=700 disp-height=367 axis-left=50 axis-top=64';
		}

		src = src + '" --audio-sink=alsasink "' + videoToPlay + '" 2>&1 ';

		if (enableLog)
		{
			src = src + "| tee -a "+ logFile +"; ";
		}


		writeLog(src);

		CurrentVideoPlayTime = -5;

		wsVideo = new WebSocket('ws://127.0.0.1:9998/');

		wsVideo.onopen = function(){
			wsVideo.send(src);

			startPlayTimeInterval();

		};

		wsVideo.onmessage=function(event)
		{
			//$('#myVideoStatus').html(event.data + " - " + event.data.length);

			checkStatus(event.data);

		};

	}
	catch(err)
	{
		writeLog("Error: " + err);
	}

}


/* playback next track request
==========================================================================================================*/
function myVideoNextRequest(){
	writeLog("myVideoNextRequest called");

	$('#myVideoName').html('');
	$('#myVideoStatus').html('');

	clearInterval(intervalPlaytime);

	if (!waitingWS)
	{
		waitingWS = true;

		var nextVideoTrack=0;

		//		previousVideoTrack = currentVideoTrack;

		if (currentVideoTrack)
		{
			nextVideoTrack = currentVideoTrack;
		}
		if(!Repeat)
		{
			if (recentlyPlayed.length >= totalVideos)
			{
				if (!RepeatAll)
				{
					myVideoStopRequest();
					waitingWS = false;
					recentlyPlayed = [];
					return;
				}
				else
				{
					recentlyPlayed = [];
				}
			}

			if (Shuffle)
			{
				while (recentlyPlayed.indexOf(nextVideoTrack) !== -1 || nextVideoTrack === currentVideoTrack)
				{
					nextVideoTrack = Math.floor(Math.random() * totalVideos);
				}
			}
			else
			{
				nextVideoTrack++;
				if (nextVideoTrack >= totalVideos)
				{
					nextVideoTrack=0;
				}
			}
		}

		localStorage.setItem('videoplayer.recentlyplayed', JSON.stringify(recentlyPlayed));

		writeLog("myVideoNextRequest select next track -- " + nextVideoTrack);

		var nextVideoObject = $(".videoTrack:eq(" + nextVideoTrack + ")");
		if(nextVideoObject.length !== 0)
		{
			wsVideo.send('x');
			wsVideo.close();
			wsVideo=null;

			myVideoStartRequest(nextVideoObject);
		}
		else
		{
			myVideoStopRequest();
		}

		waitingWS = false;
	}
}


/* playback previous track request
==========================================================================================================*/
function myVideoPreviousRequest(){
	writeLog("myVideoPreviousRequest called");

	$('#myVideoName').html('');
	$('#myVideoStatus').html('');

	clearInterval(intervalPlaytime);

	//var previousVideoTrack = currentVideoTrack;
	var previousVideoTrack = recentlyPlayed.pop();

	while (previousVideoTrack === currentVideoTrack)
	{
		previousVideoTrack = recentlyPlayed.pop();
		if (previousVideoTrack === null)
		{
			previousVideoTrack = currentVideoTrack;
			break;
		}
	}

	if (!waitingWS)
	{
		waitingWS = true;

		wsVideo.send('x');
		wsVideo.close();
		wsVideo=null;

		var previousVideoObject = $(".videoTrack:eq(" + previousVideoTrack + ")");

		myVideoStartRequest(previousVideoObject);

		waitingWS = false;
	}
}


/* stop playback request / response
==========================================================================================================*/
function myVideoStopRequest(){
	writeLog("myVideoStopRequest called");

	clearInterval(intervalPlaytime);
	$('#myVideoName').html('');
	$('#myVideoStatus').html('');
	VideoPaused=false;
	$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPauseBtn.png)'});

	wsVideo.send('x');
	wsVideo.close();
	wsVideo = null;

	currentVideoTrack = null;

	$('#myVideoPreviousBtn').css({'display' : 'none'});
	$('#myVideoRW').css({'display' : 'none'});
	$('#myVideoPausePlayBtn').css({'display' : 'none'});
	$('#myVideoFF').css({'display' : 'none'});
	$('#myVideoNextBtn').css({'display' : 'none'});
	$('#myVideoStopBtn').css({'display' : 'none'});
	$('#myVideoName').css({'display' : 'none'});
	$('#myVideoStatus').css({'display' : 'none'});
	$('#videoPlayControl').css('cssText', 'display: none !important');
	$('#videoPlayBtn').css({'background-image' : ''});

	$('#myVideoShuffleBtn').css({'display' : ''});
	$('#myVideoMovieBtn').css({'display' : ''});
	$('#myVideoFullScrBtn').css({'display' : ''});
	$('#myVideoRepeatBtn').css({'display' : ''});
	$('#myVideoRepeatAllBtn').css({'display' : ''});
	$('.rebootBtnDiv').css({'display' : ''});

	$('#toggleBgBtn').css({'visibility' : 'visible'});

	$('#myVideoList').css({'visibility' : 'visible'});
	myVideoListScrollUpDown('other');

}


/* Play/Pause playback request / response
==========================================================================================================*/
function myVideoPausePlayRequest(){
	writeLog("myVideoPausePlayRequest called");

	if (!waitingWS)
	{
		waitingWS = true;

		wsVideo.send('a');

		if(VideoPaused)
		{
			VideoPaused = false;
			$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPauseBtn.png)'});
			$('#videoPlayBtn').css({'background-image' : ''});
		}
		else
		{
			VideoPaused = true;
			$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPlayBtn.png)'});
			$('#videoPlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/video-play.png)'});
		}

		waitingWS = false;
	}
}

/* FF playback request / response
==========================================================================================================*/
function myVideoFFRequest(){
	writeLog("myVideoFFRequest called");

	if (!waitingWS)
	{
		waitingWS = true;

		if (CurrentVideoPlayTime > 0 && CurrentVideoPlayTime + 11 < TotalVideoTime)
		{
			CurrentVideoPlayTime = CurrentVideoPlayTime + 10;
		}
		else
		{
			CurrentVideoPlayTime = TotalVideoTime - 1;
		}
		wsVideo.send('e');
		wsVideo.send('1');
		wsVideo.send('t' + CurrentVideoPlayTime);

		waitingWS = false;
	}
}

/* RW playback request / response
==========================================================================================================*/
function myVideoRWRequest(){
	writeLog("myVideoRWRequest called");

	if (!waitingWS)
	{
		waitingWS = true;

		CurrentVideoPlayTime = CurrentVideoPlayTime - 10;

		if (CurrentVideoPlayTime < 0)
		{
			CurrentVideoPlayTime = 0;
		}

		wsVideo.send('e');
		wsVideo.send('1');
		wsVideo.send('t' + CurrentVideoPlayTime);

		waitingWS = false;
	}
}


/*toggles fullscreen during playback
==========================================================================================================*/
function fullScreenRequest()
{
	if (!waitingWS)
	{
		waitingWS = true;

		if(FullScreen){
			FullScreen = false;
			$('#myVideoFullScrBtn').css({'background-image' : boxUncheck});
		}
		else {
			FullScreen = true;
			$('#myVideoFullScrBtn').css({'background-image' : boxChecked});
		}

		localStorage.setItem('videoplayer.fullscreen',  JSON.stringify(FullScreen));
		wsVideo.send('f');

		waitingWS = false;
	}
}


/* write log
==========================================================================================================*/
function writeLog(logText){
	if (enableLog)
	{
		var dt = new Date();
		myVideoWs('echo "' + dt.toISOString() + '; ' + logText.replace('"', '\"').replace("$", "\\$").replace(">", "\>").replace("<", "\<") +
		'" >> ' + logFile, false); //write_log
	}
}


/* check Status
============================================================================================= */
function checkStatus(state)
{
	var res = state.trim();

	if (res.indexOf("Duration")> -1)
	{
		//res = res[3].substring(0,res[3].indexOf("]"));
		//res = res.split("/");
		CurrentVideoPlayTime = -1;
		res = res.substring(res.indexOf(":") + 2);
		res = res.split(":");
		res = Number(res[0]*3600) + Number(res[1]*60) + Number(res[2].substring(0,2));

		TotalVideoTime = res;
		CurrentVideoPlayTime = -1;

	}

	if (res.indexOf("ERR]" > -1))
	{
		$('#myVideoStatus').html("Memory Error. Please Restart CMU - " + res);
	}
}


/* Control Playback
============================================================================================= */
function startPlayTimeInterval()
{
	intervalPlaytime = setInterval(function (){

		if (!VideoPaused)
		{
			CurrentVideoPlayTime++;

			var state = '';
			var hours = Math.floor(CurrentVideoPlayTime / 3600);
			var minutes = Math.floor((CurrentVideoPlayTime - (hours * 3600)) / 60);
			var seconds = CurrentVideoPlayTime - (hours * 3600) - (minutes * 60);

			if(hours >= 0 && hours < 10){hours = "0" + hours;}
			if(minutes >= 0 && minutes < 10){minutes = "0" + minutes;}
			if(seconds >= 0 && seconds < 10){seconds = "0" + seconds;}

			state = hours + ":" + minutes + ":" + seconds;

			hours = Math.floor(TotalVideoTime / 3600);
			minutes = Math.floor((TotalVideoTime - (hours * 3600)) / 60);
			seconds = TotalVideoTime - (hours * 3600) - (minutes * 60);

			if(hours >= 0 && hours < 10){hours = "0" + hours;}
			if(minutes >= 0 && minutes < 10){minutes = "0" + minutes;}
			if(seconds >= 0 && seconds < 10){seconds = "0" + seconds;}

			state = state + " / " + hours + ":" + minutes + ":" + seconds;

			if (CurrentVideoPlayTime >= 0 && TotalVideoTime > 0)
			{
				$('#myVideoStatus').html(state);
			}

			if ((!waitingNext) && (TotalVideoTime > 0) && (CurrentVideoPlayTime >= TotalVideoTime + 1))
			{
				waitingNext = true;
				myVideoNextRequest();
			}
		}

	}, 1000);
}


/* function to handle the commander
============================================================================================= */
function handleCommander(eventID)
{
	writeLog('handleCommander - ' + eventID);

	switch(eventID) {

		case "down":
		if (currentVideoTrack === null)
		{
			if((currentVideoListContainer + 1) < totalVideoListContainer)
			{
				$('#myVideoScrollDown').click();

				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem += 8;

				if (selectedItem >= totalVideos)
				{
					selectedItem = totalVideos - 1;
				}

				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
			else if ((currentVideoListContainer + 1) === totalVideoListContainer)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem = totalVideos - 1;
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
		}
		else
		{
			$('#myVideoStopBtn').click();
		}
		break;

		case "up":
		if (currentVideoTrack === null)
		{
			if (currentVideoListContainer > 0)
			{
				$('#myVideoScrollUp').click();

				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem -= 8;
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
			else if (currentVideoListContainer === 0)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem = 0;
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
		}
		else
		{
			fullScreenRequest();
		}
		break;

		case "ccw":
		if (currentVideoTrack !== null)
		{
			$('#myVideoRW').click();
		}
		else
		{
			$(".playbackOption").eq(selectedOptionItem).removeClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return val.substring(val.indexOf("url("));});

			if (selectedItem >= 0)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");

				if ((selectedItem % 8) === 0)
				{
					$('#myVideoScrollUp').click();
				}

				selectedItem--;
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
			else //if (selectedItem < 0)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem = totalVideos - 1;
				myVideoListScrollUpDown('bottom');
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
		}
		break;

		case "cw":
		if (currentVideoTrack !== null)
		{
			$('#myVideoFF').click();
		}
		else
		{
			$(".playbackOption").eq(selectedOptionItem).removeClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return val.substring(val.indexOf("url("));});

			if (selectedItem < totalVideos - 1)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem++;
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");

				if ((selectedItem > 0) && ((selectedItem % 8) === 0))
				{
					$('#myVideoScrollDown').click();
				}
			}
			else //if (selectedItem >= totalVideos)
			{
				$(".videoTrack").eq(selectedItem).removeClass("selectedItem");
				selectedItem = 0;
				myVideoListScrollUpDown('top');
				$(".videoTrack").eq(selectedItem).addClass("selectedItem");
			}
		}
		break;

		case "left":
		if (currentVideoTrack !== null)
		{
			$('#myVideoPreviousBtn').click();
		}
		else
		{
			$(".videoTrack").eq(selectedItem).removeClass("selectedItem");

			$(".playbackOption").eq(selectedOptionItem).removeClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return val.substring(val.indexOf("url("));});

			selectedOptionItem++;

			if (selectedOptionItem > 4) //10
			{
				selectedOptionItem = 4;
			}

			$(".playbackOption").eq(selectedOptionItem).addClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return "-o-linear-gradient(top,rgba(255,0,0,0),rgba(255,0,0,1)), " + val;});
		}
		break;

		case "select":
		if (currentVideoTrack !== null)
		{
			$('#myVideoPausePlayBtn').click();
		}
		else
		{
			if ($(".videoTrack").eq(selectedItem).hasClass("selectedItem"))
			{
				myVideoStartRequest($(".videoTrack").eq(selectedItem));
			}
			else
			{
				$('.playbackOption').eq(selectedOptionItem).click();
				$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
					return "-o-linear-gradient(top,rgba(255,0,0,0),rgba(255,0,0,1)), " + val;});
			}
		}
		break;

		case "right":
		if (currentVideoTrack !== null)
		{
			$('#myVideoNextBtn').click();
		}
		else
		{
			$(".videoTrack").eq(selectedItem).removeClass("selectedItem");

			$(".playbackOption").eq(selectedOptionItem).removeClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return val.substring(val.indexOf("url("));});

			selectedOptionItem--;

			if (selectedOptionItem < 0) //6
			{
				selectedOptionItem = 0;
			}

			$(".playbackOption").eq(selectedOptionItem).addClass("selectedItem");
			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){
				return "-o-linear-gradient(top,rgba(255,0,0,0),rgba(255,0,0,1)), " + val;});

		}
		break;

		default:
		return "ignored";
	}
	return "consumed";
}

/* websocket
============================================================================================= */
function myVideoWs(action, waitMessage){

	var ws = new WebSocket('ws://127.0.0.1:9998/');

	ws.onmessage = function(event){
		var res = event.data.split('#');

		ws.close();
		ws=null;

		switch(res[0]){
			case 'playback-list':	myVideoListResponse(res[1]);
			break;
		}

	};

	ws.onopen = function(){
		ws.send(action);
		if (!waitMessage)
		{
			ws.close();
			ws=null;
		}
	};
}
// #############################################################################################
// End of Video Player
