// Copy for the paper pack's pages (scripts/pages.mjs builds them).
export const PAPER = [
  {
    id: 'curl', num: '01', label: 'Page Curl', name: 'Turn the draft', color: '#fb7185',
    aria: 'Page Curl. Scroll to turn the wireframe over like a page and reveal the finished design underneath.',
    summary: 'The wireframe is a page bound at the left edge. Scroll turns it over like a magazine page, bending and catching the light, to uncover the finished design. Click to flick it.',
    body: [
      'Scrolling takes hold of the right edge and lifts it. The sheet bends as it rises rather than folding flat: the light runs across the curve, the bend darkens where it tightens, and the sketch shows faintly through the back as it comes over.',
      'The page is a real simulated sheet with weight and give, so it lags a little behind the hand and settles when you stop. It casts a soft shadow on the finished design as it swings over the spine and lies down off the left edge.',
    ],
    play: 'Move the pointer up or down to choose where the hand holds the edge. At rest, hover near the right and the corner lifts a little. Click to flick the page. With sound on, the paper rustles as it turns, louder the faster you scroll, and flaps as it leaves.',
  },
  {
    id: 'fold', num: '02', label: 'Fold', name: 'Fold the draft', color: '#a3e635',
    aria: 'Fold. Scroll to fold the wireframe in half again and again like origami until the folded packet flies off and the finished design is left.',
    summary: 'A pencil wireframe folds in half, then in half again, four times like origami, each fold uncovering more of the finished design, until the little folded packet tumbles off the page. Click to snap a crease.',
    body: [
      'Half the sheet lifts along a crease and swings over in 3D, growing toward you as it rises and showing its underside as it comes down, with the sketch faintly mirrored through. It lands with a snap, and the next fold goes the other way.',
      'Four folds in, the page is a small packet with its creases and edges showing, and the finished design is everywhere else. Then the packet lifts, spins and sails off the page.',
    ],
    play: 'Click to snap a crease into the paper. With sound on, the paper rustles as it folds, each flap whooshes over and every fold lands with a crisp snap.',
  },
  {
    id: 'draw', num: '03', label: 'Ink Draw', name: 'Ink the draft', color: '#4a6cf7',
    aria: 'Ink Draw. Scroll to watch a pen ink the finished design over the wireframe, then colour wash in to reveal it.',
    summary: 'A pen draws the finished design\'s outlines over a pencil wireframe in ink, the pencil fades away under it, and watercolour blooms into the inked shapes until the finished design is all that is left. Click to drop some ink.',
    body: [
      'A pen works its way across the page from the top left. Wherever it has been, the finished design\'s outlines appear in ink, stroke by stroke, wet and glossy blue at first and drying dark, while the pencil sketch fades away underneath.',
      'A little behind the pen, watercolour blooms into the inked shapes: a blue-grey wash with darker edges where the pigment pools, the design\'s colours blooming in their own colour and its white text left as bare paper. Then the finished design itself comes through.',
    ],
    play: 'Move over the paper and a little ink follows your hand. Click to dab the pen: a splatter of ink, a burst of quick strokes, and the drawing starts there too. With sound on, the nib scratches across the paper, faster the harder you scroll, and the wash swells in behind it.',
  },
];
