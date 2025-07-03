// netlify/functions/gif.js
const { spawn }    = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

exports.handler = async (event) => {
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  // 1) Fetch the MP4
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video' };
  }

  // 2) Spawn ffmpeg reading from stdin, writing GIF to stdout
  const ff = spawn(ffmpegStatic, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', '-',                           // stdin
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif',
    '-'                                  // stdout
  ]);

  // 3) Stream the video data into ffmpeg.stdin
  const reader = videoRes.body.getReader();
  async function pump() {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      ff.stdin.write(Buffer.from(value));
    }
    ff.stdin.end();
  }
  pump().catch(err => {
    console.error('Stream pump error:', err);
    ff.stdin.end();
  });

  // 4) Collect ffmpeg stdout & stderr
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // 5) Wait for ffmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg exited', code, stderr);
    return {
      statusCode: 500,
      body: 'Conversion failed: ' + stderr.slice(0,200)
    };
  }

  // 6) Return the GIF as base64
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
