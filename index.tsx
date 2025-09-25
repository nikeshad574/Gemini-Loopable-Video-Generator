/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      // Return only the Base64 part of the data URL
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const statusEl = document.querySelector('#status') as HTMLDivElement;

async function generateContent(imageBytes: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Create a seamless, looping video where the first and last frames are identical. The video should be a gentle, subtle animation of the provided image.`;

  const params: any = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
    },
    image: {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG, adjust if supporting others
    },
  };

  let operation = await ai.models.generateVideos(params);

  statusEl.innerText = 'Generating... This can take a few minutes.';

  let pollCount = 0;
  const maxPolls = 20;
  while (!operation.done && pollCount < maxPolls) {
    pollCount++;
    console.log('Waiting for completion');
    await delay(10000); // Poll every 10 seconds
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch (e) {
      console.error('Error polling for operation status:', e);
      throw new Error(
        'Failed to get video generation status. Please try again.',
      );
    }
  }

  if (!operation.done) {
    throw new Error(
      'Video generation timed out. Please try again with a different image.',
    );
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error(
      'No videos were generated. The image may have been blocked.',
    );
  }

  statusEl.innerText = 'Downloading video...';

  for (const [i, v] of videos.entries()) {
    const url = decodeURIComponent(v.video.uri);
    // Append API key for access
    const res = await fetch(`${url}&key=${apiKey}`);
    const blob = await res.blob();
    const objectURL = URL.createObjectURL(blob);
    downloadFile(objectURL, `video${i}.mp4`);
    video.src = objectURL;
    console.log('Downloaded video', `video${i}.mp4`);
    video.style.display = 'block';
  }
}

// --- DOM Element Selection ---
const upload = document.querySelector('#file-input') as HTMLInputElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const fileNameEl = document.querySelector('#file-name') as HTMLSpanElement;
const imgPreview = document.querySelector('#img-preview') as HTMLImageElement;

// --- State Variables ---
let base64data = '';

// --- Initial State ---
generateButton.disabled = true;

// --- Event Listeners ---
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    fileNameEl.textContent = file.name;
    base64data = await blobToBase64(file);
    imgPreview.src = `data:image/png;base64,${base64data}`;
    imgPreview.style.display = 'block';
    generateButton.disabled = false;
  } else {
    fileNameEl.textContent = 'No file chosen';
    base64data = '';
    imgPreview.style.display = 'none';
    generateButton.disabled = true;
  }
});

generateButton.addEventListener('click', () => {
  if (!base64data) {
    showStatusError('Please choose an image to generate a video.');
    return;
  }
  generate();
});

// --- Functions ---
function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  upload.disabled = disabled;
}

async function generate() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError(
      'API key is not configured. Please set the API_KEY environment variable.',
    );
    return;
  }

  statusEl.innerText = 'Initializing video generation...';
  video.style.display = 'none';
  setControlsDisabled(true);

  try {
    await generateContent(base64data, apiKey);
    statusEl.innerText = '';
  } catch (e) {
    console.error('Video generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Error: ${errorMessage}`;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Model not found. This can be caused by an invalid API key or permission issues.';
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage = 'Your API key is invalid or lacks permissions.';
      }
    }

    showStatusError(userFriendlyMessage);
  } finally {
    setControlsDisabled(false);
  }
}