async function fetchVideos() {
  const res = await fetch('https://www.youtube.com/@mydevotionroom/videos');
  const text = await res.text();
  
  const idRegex = /"videoId":"([^"]{11})"/g;
  let match;
  let matches = [];
  while ((match = idRegex.exec(text)) !== null) {
      if (matches.length < 5) {
          console.log(`\n--- ID: ${match[1]} ---`);
          console.log(text.substring(match.index, match.index + 500));
          matches.push(match[1]);
      }
  }
}
fetchVideos();
