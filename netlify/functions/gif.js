// netlify/functions/gif.js
const { spawn } = require('child_process');
const fetch    = require('node-fetch');
const path     = require('path');

exports.handler = async (event) => {
  // 1) Read the ?video= query parameter
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  // 2) Fetch the MP4 bytes
  let res;
  try {
    res = await fetch(videoUrl);
    if (!res.ok) throw new Error(res.statusText);
  } catch (e) {
    return { statusCode: 502, body: 'Error fetching video' };
  }

  // 3) Spawn ffmpeg to convert to GIF
  const ffmpegPath = path.join(__dirname, '../../ffmpeg/ffmpeg');
  const ff = spawn(ffmpegPath, [
    '-i', 'pipe:0',                // input from stdin
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',                  // infinite loop
    '-f', 'gif',                   // force GIF format
    'pipe:1'                       // output to stdout
  ]);

  // 4) Pipe the video into ffmpeg’s stdin
  res.body.pipe(ff.stdin);

  // 5) Collect the GIF output and any errors
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', chunk => chunks.push(chunk));
  ff.stderr.on('data', chunk => stderr += chunk);

  // 6) Wait for ffmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg failed:', stderr);
    return { statusCode: 500, body: 'Conversion failed' };
  }

  // 7) Return the GIF (Base64-encoded for Lambda compatibility)
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
