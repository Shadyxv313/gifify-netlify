// netlify/functions/gif.js
const { spawn }    = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

exports.handler = async (event) => {
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  // Fetch raw MP4
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video' };
  }

  // Spawn ffmpeg reading from stdin and writing to stdout
  const ff = spawn(ffmpegStatic, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', '-',                       // read input from stdin
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif',
    '-'                              // write output to stdout
  ]);

  // Pipe entire downloaded MP4 into ffmpeg stdin
  const arrayBuffer = await videoRes.arrayBuffer();
  ff.stdin.write(Buffer.from(arrayBuffer));
  ff.stdin.end();

  // Collect the GIF output
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // Wait for ffmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg exited', code, stderr);
    return { statusCode: 500, body: 'Conversion failed: ' + stderr.slice(0,200) };
  }

  // Return the GIF as base64
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
