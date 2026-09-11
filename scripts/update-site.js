import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

const CONFIG_PATH = path.join(process.cwd(), 'scripts', 'update-site-config.json');
const SONGS_DIR = path.join(process.cwd(), 'src', 'content', 'songs');
const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const PODCAST_JSON = path.join(DATA_DIR, 'podcast-episodes.json');
const LIVESTREAMS_JSON = path.join(DATA_DIR, 'livestreams.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

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
    // 1. Process Podcasts
    console.log('\nFetching Podcast episodes...');
    const podcastItems = await fetchPlaylistAll(playlists.podcast, youtubeApiKey);
    const podcasts = podcastItems.map(formatYouTubeItem);
    fs.writeFileSync(PODCAST_JSON, JSON.stringify(podcasts, null, 2));
    console.log(`Saved ${podcasts.length} podcast episodes.`);

    // 2. Process Livestreams (sort by newest publication date)
    console.log('\nFetching Livestreams...');
    const streamItems = await fetchPlaylistAll(playlists.livestreams, youtubeApiKey);
    const streams = streamItems.map(formatYouTubeItem);
    // Sort descending by videoPublishedAt
    streams.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const topStreams = streams.slice(0, 5);
    fs.writeFileSync(LIVESTREAMS_JSON, JSON.stringify(topStreams, null, 2));
    console.log(`Saved ${topStreams.length} latest livestreams.`);

    // 3. Process Scripture Songs
    console.log('\nFetching Scripture Songs...');
    const existingIds = getExistingYoutubeIds();
    const songItems = await fetchPlaylistAll(playlists.scriptureSongs, youtubeApiKey);
    
    let newSongsCount = 0;
    const generatedDrafts = [];

    for (const item of songItems) {
      const data = formatYouTubeItem(item);
      if (existingIds.has(data.videoId)) continue;
      
      const safeTitle = data.title.replace(/["']/g, '');
      // Collapse newlines → space, collapse multiple spaces, strip leading/trailing whitespace,
      // escape any remaining double-quotes so the YAML string is always single-line and valid.
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

    if (newSongsCount > 0) {
      console.log(`\nFound ${newSongsCount} new Scripture songs. Generated draft files:`);
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

    // 5. Git Push
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
