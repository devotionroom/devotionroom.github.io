async function run() {
  const ids = [
    '2rtFsvY6FCk', 'Hr6ymQSpBlM', '6nYHwKRXqCQ',
    'i7U9cZ4BWTU', '-VvTkHNFmJQ', 'ifzYQyNEpMI',
    '__uZkA57-vc', 'AqRGDoZg4Rc', 'DMWWeIAEYN0',
    '62a1aVv1Qi8', 'Uc7RTkU2vxA', '0KhMBuEibtM',
    'jVKz-8Gm3FQ', '2R_XpX8u6VI', 'KlG2A2ByPgQ',
    'aDjzfQR975g', 'tEvqIcDWYzY', 'W0QIilVFcks',
    'dXJyq0tHmvM', 'OIm3CQNqDmM', 'J_Auv--ak28',
    'efsAQ-wsycQ', 'fgWjANuL5yI', 'BOGC0JhunQQ',
    'jCwVp0yGuGE', 'VU0Q_8Ovf3w', 'Wwx0DQSjcoQ',
    'j4D62e2h-Ro', 'qF67-U7QbNs', 'QyJH3CQjWww',
    '-646X8ERG1A'
  ];
  
  for (const id of ids) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (data.title.toLowerCase().includes('song') || data.title.toLowerCase().includes('psalm') || data.title.toLowerCase().includes('isaiah')) {
          console.log(`${id} | ${data.title}`);
        }
      }
    } catch(e) {}
  }
}
run();
