// netlify/functions/gif.js
const { spawn }     = require('child_process');
const ffmpegStatic  = require('ffmpeg-static');

exports.handler = async (event) => {
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  // 1) Fetch MP4 via built-in fetch (Node 18+)
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video' };
  }

  // 2) Spawn ffmpeg to convert
  const ffmpegPath = ffmpegStatic;
  const ff = spawn(ffmpegPath, [
    '-i', 'pipe:0',
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif',
    'pipe:1'
  ]);

  // 3) Pipe video stream into ffmpeg’s stdin
  videoRes.body.pipe(ff.stdin);

  // 4) Collect output GIF bytes
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // 5) Await process completion
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg error:', stderr);
    return { statusCode: 500, body: 'Conversion failed' };
  }

  // 6) Return GIF in base64
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
