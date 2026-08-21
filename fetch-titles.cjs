const fs = require('fs');
async function run() {
  const text = await (await fetch('https://www.youtube.com/@mydevotionroom/videos')).text();
  const titleRegex = /"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
  let match;
  let titles = new Set();
  while ((match = titleRegex.exec(text)) !== null) {
      if (match[1].toLowerCase().includes('song')) {
          titles.add(match[1]);
      }
  }
  console.log(Array.from(titles));
}
run();
