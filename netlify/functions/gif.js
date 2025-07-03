// netlify/functions/gif.js
const { spawn }    = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

exports.handler = async (event) => {
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video' };
  }

  const ff = spawn(ffmpegStatic, [
    '-hide_banner','-loglevel','error',
    '-i','-',
    '-vf','fps=10,scale=600:-1:flags=lanczos',
    '-loop','0',
    '-f','gif','-'
  ]);

  // stream the response into ffmpeg
  const reader = videoRes.body.getReader();
  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      ff.stdin.write(Buffer.from(value));
    }
    ff.stdin.end();
  })();

  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg failed:', stderr);
    return { statusCode: 500, body: 'Conversion failed: ' + stderr.slice(0,200) };
  }

  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
