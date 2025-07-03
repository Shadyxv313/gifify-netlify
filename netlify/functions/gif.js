// netlify/functions/gif.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Construct the path to the FFmpeg binary inside the bundled function
const ffmpegPath = path.join(__dirname, '../bin/ffmpeg');

exports.handler = async function(event, context) {
  try {
    // Expect a video URL as a query parameter, e.g. ?video=https://example.com/video.mp4
    const params = event.queryStringParameters || {};
    const videoUrl = params.video;
    if (!videoUrl) {
      return {
        statusCode: 400,
        body: 'Missing "video" query parameter specifying the video URL.',
      };
    }

    // Define output path in Netlify function's temporary storage
    const outputPath = '/tmp/output.gif';
    // Set up FFmpeg arguments to convert the video to a 5-second GIF (320px width, 10fps)
    const ffmpegArgs = [
      '-i', videoUrl,       // Input video URL
      '-t', '5',            // Duration: first 5 seconds
      '-vf', 'scale=320:-1',// Scale width to 320px, height auto
      '-r', '10',           // Frame rate 10 fps for output
      '-y', outputPath      // Overwrite output file if exists, and save to outputPath
    ];

    // Spawn the FFmpeg process using the bundled binary
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

    // Wait for FFmpeg to finish execution
    await new Promise((resolve, reject) => {
      ffmpegProcess.on('error', (error) => reject(error));         // If process fails to start
      ffmpegProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    // Read the generated GIF file from the output path
    const gifBuffer = fs.readFileSync(outputPath);
    const base64Gif = gifBuffer.toString('base64');  // Convert to base64 for binary response

    // Return the GIF image with proper headers. Use base64 encoding since it's binary data.
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/gif'
      },
      body: base64Gif,
      isBase64Encoded: true   // Tells Netlify to decode the base64 body back to binary
    };
  } catch (err) {
    console.error('Error in GIF generation function:', err);
    return {
      statusCode: 500,
      body: `Server Error: ${err.message}`
    };
  }
};
