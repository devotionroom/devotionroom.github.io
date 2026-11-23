import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

const CONFIG_PATH = path.join(process.cwd(), 'scripts', 'update-site-config.json');
const SONGS_DIR = path.join(process.cwd(), 'src', 'content', 'songs');
const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const PODCAST_JSON = path.join(DATA_DIR, 'podcast-episodes.json');
const LIVESTREAMS_JSON = path.join(DATA_DIR, 'livestreams.json');
const EXCLUDED_JSON = path.join(DATA_DIR, 'excluded-videos.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function getExcludedVideos() {
  if (fs.existsSync(EXCLUDED_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(EXCLUDED_JSON, 'utf8'));
    } catch (e) {
      console.warn('Warning: Could not parse excluded-videos.json, defaulting to empty list.');
      return [];
    }
  }
  return [];
}

function saveExcludedVideo(videoId, title, reason = 'confirmed_deleted') {
  const list = getExcludedVideos();
  if (!list.some(v => v.videoId === videoId)) {
    list.push({
      videoId,
      title: title || 'Deleted video',
      reason,
      excludedAt: new Date().toISOString().split('T')[0]
    });
    fs.writeFileSync(EXCLUDED_JSON, JSON.stringify(list, null, 2));
    console.log(`[EXCLUDED] Added video ${videoId} to permanent exclusion list (${reason}).`);
  }
}

async function fetchPlaylistAll(playlistId, apiKey) {
  let items = [];
  let nextPageToken = '';
  
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`YouTube API error (${res.status}): ${errText}`);
    }
    const data = await res.json();
    items = items.concat(data.items);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  
  return items;
}

/**
 * Checks if a playlist item shows obvious signs of deletion or privacy.
 * Returns: { isDeleted: boolean, isPrivate: boolean, isInvalid: boolean }
 */
function inspectPlaylistItem(item) {
  const snippet = item.snippet || {};
  const contentDetails = item.contentDetails || {};
  const title = (snippet.title || '').trim().toLowerCase();
  const desc = (snippet.description || '').trim().toLowerCase();
  const hasThumbnails = snippet.thumbnails && Object.keys(snippet.thumbnails).length > 0;
  const videoId = contentDetails.videoId;

  if (!videoId) {
    return { isDeleted: true, isPrivate: false, isInvalid: true, reason: 'missing_videoId' };
  }

  if (title === 'deleted video' || desc.includes('this video is unavailable')) {
    return { isDeleted: true, isPrivate: false, isInvalid: true, reason: 'confirmed_deleted' };
  }

  if (title === 'private video') {
    return { isDeleted: false, isPrivate: true, isInvalid: true, reason: 'private' };
  }

  if (!hasThumbnails && title.includes('deleted')) {
    return { isDeleted: true, isPrivate: false, isInvalid: true, reason: 'confirmed_deleted' };
  }

  return { isDeleted: false, isPrivate: false, isInvalid: false, reason: null };
}

/**
 * Actively verify video status via YouTube videos.list endpoint in batches of 50.
 */
async function verifyVideosBatch(videoIds, apiKey) {
  const result = {
    validIds: new Set(),
    deletedIds: new Set(),
    privateIds: new Set(),
    unverifiedIds: new Set()
  };

  if (!videoIds || videoIds.length === 0) return result;

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=id,status,snippet&id=${chunk.join(',')}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[WARN] YouTube videos.list check returned HTTP ${res.status}. Proceeding cautiously without permanent exclusion.`);
        chunk.forEach(id => result.unverifiedIds.add(id));
        continue;
      }
      const data = await res.json();
      const returnedIds = new Set();

      for (const item of (data.items || [])) {
        returnedIds.add(item.id);
        const priv = item.status?.privacyStatus;
        const upload = item.status?.uploadStatus;

        if (priv === 'private') {
          result.privateIds.add(item.id);
        } else if (upload === 'rejected' || upload === 'failed') {
          result.deletedIds.add(item.id);
        } else {
          result.validIds.add(item.id);
        }
      }

      // Any ID requested that YouTube did not return at all is confirmed deleted
      for (const id of chunk) {
        if (!returnedIds.has(id)) {
          result.deletedIds.add(id);
        }
      }
    } catch (err) {
      console.warn(`[WARN] Verification failed for batch (${err.message}). Skipping verification without permanent exclusion.`);
      chunk.forEach(id => result.unverifiedIds.add(id));
    }
  }

  return result;
}

function getExistingYoutubeIds() {
  const ids = new Set();
  const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(SONGS_DIR, file), 'utf8');
    const match = content.match(/youtubeId:\s*["']([^"']+)["']/);
    if (match && match[1]) {
      ids.add(match[1]);
    }
  }
  return ids;
}

function formatYouTubeItem(item) {
  const snippet = item.snippet;
  const contentDetails = item.contentDetails;
  
  // Get best thumbnail
  let thumbnail = '';
  if (snippet.thumbnails) {
    thumbnail = (snippet.thumbnails.maxres || snippet.thumbnails.high || snippet.thumbnails.medium || snippet.thumbnails.default || {}).url || '';
  }

  return {
    videoId: contentDetails.videoId,
    title: snippet.title,
    description: snippet.description,
    publishedAt: contentDetails.videoPublishedAt || snippet.publishedAt,
    thumbnail: thumbnail
  };
}

async function main() {
  console.log('Starting Devotion Room Updater...');

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('ERROR: scripts/update-site-config.json not found!');
    console.error('Please copy scripts/update-site-config.example.json, add your API key, and try again.');
    rl.close();
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const { youtubeApiKey, playlists } = config;

  if (!youtubeApiKey || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_HERE') {
    console.error('ERROR: Please put a valid YouTube API key in scripts/update-site-config.json');
    rl.close();
    process.exit(1);
  }

  try {
    const excludedList = getExcludedVideos();
    const excludedSet = new Set(excludedList.map(v => v.videoId));

    // 1. Process Podcasts
    console.log('\nFetching Podcast episodes...');
    const rawPodcastItems = await fetchPlaylistAll(playlists.podcast, youtubeApiKey);
    const validPodcasts = [];

    for (const item of rawPodcastItems) {
      const inspect = inspectPlaylistItem(item);
      const vId = item.contentDetails?.videoId;

      if (excludedSet.has(vId) || inspect.isDeleted) {
        if (inspect.isDeleted && vId && !excludedSet.has(vId)) {
          saveExcludedVideo(vId, item.snippet?.title, 'confirmed_deleted');
          excludedSet.add(vId);
        }
        continue;
      }

      if (inspect.isPrivate) {
        console.log(`[REVIEW NEEDED] Podcast episode "${item.snippet?.title}" (${vId}) is private. Skipping.`);
        continue;
      }

      validPodcasts.push(formatYouTubeItem(item));
    }

    fs.writeFileSync(PODCAST_JSON, JSON.stringify(validPodcasts, null, 2));
    console.log(`Saved ${validPodcasts.length} valid podcast episodes.`);

    // 2. Process Livestreams (sort by newest publication date)
    console.log('\nFetching Livestreams...');
    const livestreamPlaylistIds = Array.isArray(playlists.livestreams)
      ? playlists.livestreams
      : [playlists.livestreams];

    const seenStreamVideoIds = new Set();
    const allStreams = [];

    for (const playlistId of livestreamPlaylistIds) {
      if (!playlistId) continue;
      console.log(`  Fetching playlist ${playlistId}...`);
      const streamItems = await fetchPlaylistAll(playlistId, youtubeApiKey);
      for (const item of streamItems) {
        const inspect = inspectPlaylistItem(item);
        const vId = item.contentDetails?.videoId;

        if (!vId || seenStreamVideoIds.has(vId) || excludedSet.has(vId) || inspect.isDeleted) {
          if (inspect.isDeleted && vId && !excludedSet.has(vId)) {
            saveExcludedVideo(vId, item.snippet?.title, 'confirmed_deleted');
            excludedSet.add(vId);
          }
          continue;
        }

        if (inspect.isPrivate) {
          console.log(`[REVIEW NEEDED] Livestream "${item.snippet?.title}" (${vId}) is private. Skipping.`);
          continue;
        }

        seenStreamVideoIds.add(vId);
        allStreams.push(formatYouTubeItem(item));
      }
    }

    // Sort descending by actual video publication date (videoPublishedAt)
    allStreams.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const topStreams = allStreams.slice(0, 5);
    fs.writeFileSync(LIVESTREAMS_JSON, JSON.stringify(topStreams, null, 2));
    console.log(`Saved ${topStreams.length} latest valid livestreams across ${livestreamPlaylistIds.length} playlist(s).`);

    // 3. Process Scripture Songs
    console.log('\nFetching Scripture Songs...');
    const existingIds = getExistingYoutubeIds();
    const songItems = await fetchPlaylistAll(playlists.scriptureSongs, youtubeApiKey);
    
    // Initial candidate filtering
    const candidateItems = [];
    for (const item of songItems) {
      const vId = item.contentDetails?.videoId;
      if (!vId) continue;

      if (excludedSet.has(vId)) {
        continue;
      }

      const inspect = inspectPlaylistItem(item);
      if (inspect.isDeleted) {
        saveExcludedVideo(vId, item.snippet?.title, 'confirmed_deleted');
        excludedSet.add(vId);
        continue;
      }

      if (inspect.isPrivate) {
        console.log(`[REVIEW NEEDED] Scripture Song "${item.snippet?.title}" (${vId}) is private. Skipping.`);
        continue;
      }

      if (existingIds.has(vId)) {
        continue;
      }

      candidateItems.push(item);
    }

    let newSongsCount = 0;
    const generatedDrafts = [];

    if (candidateItems.length > 0) {
      console.log(`Verifying ${candidateItems.length} candidate new Scripture song(s) with YouTube API...`);
      const candidateIds = candidateItems.map(item => item.contentDetails.videoId);
      const verification = await verifyVideosBatch(candidateIds, youtubeApiKey);

      for (const item of candidateItems) {
        const vId = item.contentDetails.videoId;

        if (verification.deletedIds.has(vId)) {
          saveExcludedVideo(vId, item.snippet?.title, 'confirmed_deleted');
          excludedSet.add(vId);
          continue;
        }

        if (verification.privateIds.has(vId)) {
          console.log(`[REVIEW NEEDED] Video ${vId} is private on YouTube. Skipping.`);
          continue;
        }

        if (verification.unverifiedIds.has(vId)) {
          console.log(`[FLAGGED] Video ${vId} could not be verified by YouTube API. Skipping without permanent exclusion.`);
          continue;
        }

        // Confirmed valid new video
        const data = formatYouTubeItem(item);
        const safeTitle = data.title.replace(/["']/g, '');
        const rawDesc = (data.description || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const shortDesc = rawDesc.substring(0, 200).replace(/"/g, "'") + '...';
        const dateStr = data.publishedAt ? data.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0];
        
        const mdContent = `---
title: "${safeTitle}"
date: ${dateStr}
youtubeId: "${data.videoId}"
category: "General"
description: "${shortDesc}"
featured: false
draft: true
topic: []
thumbnail: "${data.thumbnail}"
videoUrl: "https://youtu.be/${data.videoId}"
---

<!-- AUTO-GENERATED. Review and set draft: false to publish. -->

## Reflection

Watch and listen to this Scripture song to reflect on God's Word.
`;
        const filename = `auto-${data.videoId}.md`;
        fs.writeFileSync(path.join(SONGS_DIR, filename), mdContent);
        generatedDrafts.push(filename);
        newSongsCount++;
      }
    }

    if (newSongsCount > 0) {
      console.log(`\nFound ${newSongsCount} new verified Scripture songs. Generated draft files:`);
      generatedDrafts.forEach(f => console.log(`  - src/content/songs/${f}`));
      
      const ans = await question(`\nWould you like to publish these ${newSongsCount} drafts immediately? (Y/N): `);
      if (ans.trim().toLowerCase() === 'y') {
        for (const file of generatedDrafts) {
          const fp = path.join(SONGS_DIR, file);
          let content = fs.readFileSync(fp, 'utf8');
          content = content.replace('draft: true', 'draft: false');
          fs.writeFileSync(fp, content);
        }
        console.log('Drafts updated to published (draft: false).');
      } else {
        console.log('Drafts left unpublished. You can review them later.');
      }
    } else {
      console.log('No new Scripture songs found.');
    }

    // 4. Dependency check + Build
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('\nnode_modules not found. Running npm install...');
      execSync('npm install', { stdio: 'inherit' });
      console.log('Dependencies installed.');
    } else {
      console.log('\nDependencies already installed. Skipping npm install.');
    }

    console.log('\nBuilding Astro site...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('Build successful!');

    // 5. Git Status Check (without auto-push if skipped)
    console.log('\nChecking for file changes...');
    try {
      const status = execSync('git status --porcelain').toString();
      if (!status.trim()) {
        console.log('No changes detected. Site is fully up to date.');
      } else {
        console.log('\nChanges detected:\n' + status);
        const pushAns = await question('Push to GitHub? (Y/N): ');
        if (pushAns.trim().toLowerCase() === 'y') {
          console.log('Adding files...');
          execSync('git add .', { stdio: 'inherit' });
          console.log('Committing...');
          execSync('git commit -m "Auto-update site via update-site.bat"', { stdio: 'inherit' });
          console.log('Pushing to GitHub...');
          execSync('git push', { stdio: 'inherit' });
          console.log('Push complete! GitHub Actions is now deploying the site.');
        } else {
          console.log('Changes saved locally. You can push manually when ready.');
        }
      }
    } catch (e) {
      console.log('Git commands skipped or failed.');
    }

  } catch (err) {
    console.error('\nAN ERROR OCCURRED:', err.message);
  } finally {
    rl.close();
  }
}

main();
