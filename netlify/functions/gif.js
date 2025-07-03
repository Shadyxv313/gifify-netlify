// netlify/functions/gif.js
const { spawn }    = require('child_process');
const ffmpegPath   = require('ffmpeg-static');

exports.handler = async (event) => {
  // 1) Decode the incoming URL
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

  // 2) Fetch the MP4 via built-in fetch
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video: ' + e.message };
  }

  // 3) Spawn ffmpeg reading from stdin, writing GIF to stdout
  const ff = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', '-',                        // stdin
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif', '-'
  ]);

  // 4) Stream the video data into ffmpeg.stdin
  const reader = videoRes.body.getReader();
  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      ff.stdin.write(Buffer.from(value));
    }
    ff.stdin.end();
  })().catch(err => {
    console.error('Stream pump error:', err);
    ff.stdin.end();
  });

  // 5) Collect output
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // 6) Wait for ffmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg failed:', stderr);
    return {
      statusCode: 500,
      body: 'Conversion failed: ' + stderr.slice(0,200)
    };
  }

  // 7) Return the GIF as base64
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
