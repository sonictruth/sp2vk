(function() {

	'use strict';

	var rp = require('request-promise');
	var fs = require('fs-extra');
	var path = require('path');
	var http = require('http');
	var Promise = require('bluebird');
	var pjson = require('./package.json');
	var Entities = require('html-entities').XmlEntities;
	var entities = new Entities();
	var trackDir = 'tracks' + path.sep;

	fs.ensureDirSync(trackDir);

	console.log(pjson.name + ' ' + pjson.version);

	try {
		var token = fs.readFileSync('token.txt');
	} catch (e) {
		console.log('To generate token create standalone application: https://vk.com/editapp?act=create');
		console.log('Get the APP_ID and replace it in the URL below');
		console.log('Go to https://oauth.vk.com/authorize?client_id=APP_ID&redirect_uri=https://oauth.vk.com/blank.html&response_type=token&scope=audio');
		console.log('Save the token in  a file named token.txt in the current directory.');
		return;
	}

	var searchVK = function(artist, track, seconds) {
		var q = encodeURIComponent(artist + ' ' + track).replace('%26', '');
		var url = 'https://api.vk.com/method/audio.search?q=' + q + '&count=10&sort=2&access_token=' + token;
		console.log('Found: ', artist, track, seconds);
		return rp(url).then(function(result) {
			//console.log(url);
			var tracks = JSON.parse(result).response;
			var count = tracks.shift();
			if (count === 0) {
				console.log('No results for ' + artist + ' ' + track);
				return null;
			}

			var curr = tracks[0];
			tracks.forEach(function(track) {
				if (Math.abs(seconds - track.duration) < Math.abs(seconds - curr.duration)) {
					curr = track;
				}
				//console.log('Duration:' + track.duration);
			});
			curr.artist = entities.decode(curr.artist);
			curr.title = entities.decode(curr.title);
			return curr;
		});
	};

	var searchSpotify = function(id) {
		var url = 'https://api.spotify.com/v1/tracks/' + id;
		return rp(url).then(function(result) {
			var track = JSON.parse(result);
			return {
				artist: track.artists[0].name,
				track: track.name,
				duration: (track.duration_ms / 1000)
			};
		});
	};

	var downloadTrack = function(url, dest, cb) {
		console.log('Downloading: ' + dest);
		var file = fs.createWriteStream(dest);
		var request = http.get(url, function(response) {
			response.pipe(file);
			file.on('finish', function() {
				console.log('Done: ' + dest);
				file.close(cb);
			});
		}).on('error', function(err) {
			cb(err);
			fs.unlink(dest);
		});
	};


	var spotifyPlaylist = fs.readFileSync('playlist.txt').toString().match(/([a-z0-9]{22})/img);

	console.log('Playlist size: ' + spotifyPlaylist.length);
	spotifyPlaylist = spotifyPlaylist.filter(function(elem, pos, arr) {
		return arr.indexOf(elem) === pos;
	});
	console.log('After removing duplicates: ' + spotifyPlaylist.length);

	Promise.map(spotifyPlaylist, function(spotifyId) {

			return new Promise(function(resolve, reject) {

				searchSpotify(spotifyId)
					.then(function(r) {
						return searchVK(r.artist, r.track, r.duration);
					})
					.then(function(track) {
						var dest = trackDir + track.artist + ' - ' + track.title + '.mp3';
						downloadTrack(track.url, dest, resolve);
					})
					.catch(function(err) {
						console.log('Error for track id: ' + spotifyId + '\n' + err);
						resolve();
					});
			});

		}, {
			concurrency: 3
		})
		.then(function() {
			console.log('Finished!');
		});



})();