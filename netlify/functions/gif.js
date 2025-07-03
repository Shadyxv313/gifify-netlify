// netlify/functions/gif.js

const path      = require('path');
const { spawn } = require('child_process');

// Point to the vendored ffmpeg binary in netlify/functions/bin/ffmpeg
const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg');

exports.handler = async function(event) {
  // 1) Decode the incoming ?video= parameter
  const rawUrl = event.queryStringParameters?.video;
  if (!rawUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }
  let videoUrl;
  try {
    videoUrl = decodeURIComponent(rawUrl);
  } catch {
    return { statusCode: 400, body: 'Invalid encoded URL' };
  }

  // 2) Fetch the MP4 via the built-in fetch()
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 502, body: 'Error fetching video: ' + err.message };
  }

  // 3) Spawn ffmpeg (reading from stdin, writing GIF to stdout)
  const ff = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', '-',                       // read input from stdin
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif', '-'                 // write output to stdout
  ]);

  // 4) Stream the video response body into ffmpeg.stdin
  const reader = videoRes.body.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        ff.stdin.write(Buffer.from(value));
      }
    } catch (err) {
      console.error('Stream pump error:', err);
    } finally {
      ff.stdin.end();
    }
  })();

  // 5) Collect ffmpeg stdout (the GIF) and stderr
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', chunk => chunks.push(chunk));
  ff.stderr.on('data', chunk => stderr += chunk);

  // 6) Wait for ffmpeg to finish
  const code = await new Promise(resolve => ff.on('close', resolve));
  if (code !== 0) {
    console.error('ffmpeg failed:', stderr);
    return {
      statusCode: 500,
      body: 'Conversion failed: ' + stderr.slice(0,200)
    };
  }

  // 7) Return the GIF as Base64
  const gifBuffer = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gifBuffer.toString('base64'),
    isBase64Encoded: true
  };
};
