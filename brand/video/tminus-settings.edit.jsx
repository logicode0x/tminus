// T-minus, what you set: a flat black-and-white walk through the launch form in Satoshi, counting down like the site's guide (T−5 … T−0).
// Every label is the live form's own (web/pages/launch/editors.jsx, review.jsx); the token "Orbit" and its numbers are an example launch.
const W = 1920, H = 1080, X0 = 160;
const INK = '#111111', INK2 = '#4A4A4A', INK3 = '#6B6B6B', LINE = '#E6E6E6', FOG = '#F2F2F2', S2 = '#D9D9D9';
const M = '−';

export default async ({ project, icon }) => {
  const p = await project({ size: '1920x1080', fps: 30, background: '#FFFFFF' });
  const sat = await p.add('Satoshi-Variable.ttf');
  const face = w => ({ fontAssetId: sat.id, axes: { wght: w } });
  const T = ({ w = 500, size = 40, color = INK, children, ...rest }) => (
    <text fontSize={size} color={color} letterSpacing={-0.03 * size} lineHeight={1.15} typography={face(w)} {...rest}>{children}</text>
  );
  const fadeIn = (at, dur = 0.5) => ({ enter: { from: { opacity: 0, y: 18 }, duration: dur, easing: 'house', at } });
  const show = (at, dur = 0.25) => [{ property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at, value: 0 }, { at: at + dur, value: 1 }] }];
  const hide = (at, dur = 0.25) => [{ property: 'opacity', keyframes: [{ at: 0, value: 1 }, { at, value: 1 }, { at: at + dur, value: 0 }] }];
  const typing = at => ({ by: 'character', from: { opacity: 0 }, at, duration: 0.06, overlap: 0, easing: 'linear' });

  // The mark: a bar, and under it a drop falling straight down (the site's logo; its arc rebuilt as four cubics). h = full height.
  const mark = ({ x, y, h, color = INK, at = null }) => {
    const k = h / 45, X = v => ((v - 40) * k).toFixed(2), Y = v => ((v - 42) * k).toFixed(2);
    const d = `M${X(50)} ${Y(42)} L${X(58.215)} ${Y(60.331)} C${X(59.46)} ${Y(63.114)} ${X(59.211)} ${Y(66.342)} ${X(57.553)} ${Y(68.901)} `
      + `C${X(55.895)} ${Y(71.46)} ${X(53.049)} ${Y(73.006)} ${X(50)} ${Y(73.006)} C${X(46.951)} ${Y(73.006)} ${X(44.105)} ${Y(71.46)} ${X(42.447)} ${Y(68.901)} `
      + `C${X(40.789)} ${Y(66.342)} ${X(40.54)} ${Y(63.114)} ${X(41.785)} ${Y(60.331)} Z`;
    const bar = at === null ? {} : { animate: [{ property: 'scaleX', from: 0, to: 1, at, duration: 0.55, easing: 'house' }] };
    const drop = at === null ? {} : { animate: [{ property: 'offsetY', from: -34 * k, to: 0, at: at + 0.35, duration: 0.7, easing: 'house' },
      { property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: at + 0.35, value: 0 }, { at: at + 0.5, value: 1 }] }] };
    return [
      <rect x={x} y={y} width={40 * k} height={9 * k} fill={color} {...bar} />,
      <path x={x + 10 * k} y={y + 14 * k} width={20 * k} height={31.1 * k} d={d} fill={color} {...drop} />,
    ];
  };

  // ---- The form's controls, drawn as the site draws them (flat, hairlines, 8px corners) ---------------------------------------
  // A field: a grey label over a hairline box holding the value; `typeAt` types the value in.
  const field = ({ x, y, w, label, value, at, typeAt = null }) => (
    <frame x={x} y={y} width={w} height={130} layout="none" motion={fadeIn(at)}>
      <T x={0} y={0} width={w} size={28} w={500} color={INK3}>{label}</T>
      <rect x={0} y={44} width={w} height={80} radius={8} fill="#FFFFFF" strokeColor={LINE} strokeWidth={2} />
      <T x={24} y={61} width={w - 48} size={40} w={600} {...(typeAt === null ? {} : { motion: typing(typeAt) })}>{value}</T>
    </frame>
  );
  // The switch: a grey track, an ink track fading in as the knob slides across, and its words swapping from off to on.
  const toggle = ({ x, y, label, off, on, at, flip }) => (
    <frame x={x} y={y} width={760} height={120} layout="none" motion={fadeIn(at)}>
      <T x={0} y={0} width={760} size={28} w={500} color={INK3}>{label}</T>
      <rect x={0} y={50} width={84} height={48} radius={24} fill={S2} />
      <rect x={0} y={50} width={84} height={48} radius={24} fill={INK} animate={show(flip, 0.2)} />
      <rect x={6} y={56} width={36} height={36} radius={18} fill="#FFFFFF" animate={[{ property: 'offsetX', from: 0, to: 36, at: flip, duration: 0.28, easing: 'house' }]} />
      <frame x={112} y={53} width={640} height={50} layout="none" animate={hide(flip, 0.15)}><T x={0} y={0} width={640} size={36} w={600} color={INK3}>{off}</T></frame>
      <frame x={112} y={53} width={640} height={50} layout="none" animate={show(flip + 0.1, 0.2)}><T x={0} y={0} width={640} size={36} w={600}>{on}</T></frame>
    </frame>
  );
  // The compact switch: options on a grey strip, the picked one on white; `moves` ([[time, index]]) slides the white tile.
  const choice = ({ x, y, w, label, options, at, moves = [] }) => {
    const ow = (w - 12) / options.length;
    let prev = 0;
    const kf = [{ at: 0, value: 0 }];
    for (const [t, i] of moves) { kf.push({ at: t, value: prev }, { at: t + 0.32, value: i * ow }); prev = i * ow; }
    return (
      <frame x={x} y={y} width={w} height={140} layout="none" motion={fadeIn(at)}>
        <T x={0} y={0} width={w} size={28} w={500} color={INK3}>{label}</T>
        <rect x={0} y={44} width={w} height={84} radius={12} fill={FOG} />
        <rect x={6} y={50} width={ow} height={72} radius={8} fill="#FFFFFF" strokeColor={S2} strokeWidth={2}
          {...(moves.length ? { animate: [{ property: 'offsetX', keyframes: kf, easing: 'house' }] } : {})} />
        {options.map((o, i) => <T x={6 + i * ow} y={66} width={ow} size={34} w={600} align="center">{o}</T>)}
      </frame>
    );
  };

  // Every section after the opening: the countdown label and a hairline, then its content.
  const scene = (at, dur, t, title, children, last = false) => p.compose(
    <frame width={W} height={H} layout="none" motion={{ enter: { from: { opacity: 0, y: 20 }, duration: 0.5, easing: 'house' },
      ...(last ? {} : { exit: { to: { opacity: 0, y: -12 }, duration: 0.35 } }) }}>
      <T x={X0} y={92} width={200} size={36} w={800}>{t}</T>
      <T x={X0 + 120} y={96} width={900} size={32} w={500} color={INK3}>{title}</T>
      <rect x={X0} y={168} width={W - 2 * X0} height={2} fill={LINE} />
      {children}
    </frame>,
    { at, dur },
  );

  // ---- 0: the mark lands, the name follows -------------------------------------------------------------------------------------
  p.compose(
    <frame width={W} height={H} layout="none" motion={{ exit: { to: { opacity: 0, y: -12 }, duration: 0.35 } }}>
      {mark({ x: 640, y: 392, h: 156, at: 0.2 })}
      <T x={808} y={372} width={720} size={176} w={700} motion={{ by: 'character', from: { opacity: 0, y: 30 }, at: 0.9, duration: 0.7, overlap: 0.6, easing: 'house' }}>t-minus</T>
      <frame x={0} y={640} width={W} height={80} layout="none" motion={fadeIn(1.9, 0.6)}>
        <T x={0} y={0} width={W} size={50} w={400} color={INK3} align="center">Set every part of your Meteora launch.</T>
      </frame>
    </frame>,
    { at: 0, dur: 5.0 },
  );

  // ---- T−5: the token ----------------------------------------------------------------------------------------------------------
  scene(5.0, 6.6, `T${M}5`, 'The token', [
    <frame x={X0} y={236} width={132} height={132} layout="none" motion={fadeIn(0.3)}>
      <rect x={0} y={0} width={132} height={132} radius={66} fill={FOG} />
      {icon('image', { x: 38, y: 38, size: 56, color: INK3, strokeWidth: 1.6 })}
    </frame>,
    field({ x: 330, y: 230, w: 530, label: 'Name', value: 'Orbit', at: 0.3, typeAt: 0.6 }),
    field({ x: X0, y: 400, w: 330, label: 'Ticker', value: 'ORB', at: 0.45, typeAt: 0.9 }),
    field({ x: 530, y: 400, w: 330, label: 'Decimals', value: '6', at: 0.6 }),
    field({ x: X0, y: 570, w: 700, label: 'Supply', value: '1,000,000,000', at: 0.75, typeAt: 1.0 }),
    choice({ x: X0, y: 740, w: 700, label: 'Token program', options: ['SPL Token', 'Token-2022'], at: 0.9, moves: [[3.4, 1]] }),
    toggle({ x: 1000, y: 230, label: 'Minting more tokens', off: 'You can mint more', on: 'Switched off for good', at: 0.6, flip: 1.6 }),
    toggle({ x: 1000, y: 370, label: 'Freezing holders’ tokens', off: 'You can freeze holders', on: 'Impossible', at: 0.75, flip: 2.1 }),
    toggle({ x: 1000, y: 510, label: 'Name, ticker and image', off: 'You can change them', on: 'Locked for good', at: 0.9, flip: 2.6 }),
    <frame x={1000} y={680} width={760} height={160} layout="none" motion={fadeIn(1.05)}>
      <T x={0} y={0} width={560} size={28} w={500} color={INK3}>Tax on every transfer</T>
      <rect x={0} y={68} width={560} height={8} radius={4} fill={S2} />
      <frame x={0} y={68} width={168} height={8} layout="none" reveal={{ from: 'left', at: 3.8, duration: 0.6, easing: 'house' }}>
        <rect x={0} y={0} width={168} height={8} radius={4} fill={INK} />
      </frame>
      <rect x={0} y={56} width={32} height={32} radius={16} fill={INK} animate={[{ property: 'offsetX', from: 0, to: 152, at: 3.8, duration: 0.6, easing: 'house' }]} />
      <frame x={600} y={46} width={160} height={60} layout="none" animate={hide(3.8, 0.2)}><T x={0} y={0} width={160} size={48} w={700} color={INK3}>0%</T></frame>
      <frame x={600} y={46} width={160} height={60} layout="none" animate={show(4.3, 0.25)}><T x={0} y={0} width={160} size={48} w={700}>3%</T></frame>
      <T x={0} y={112} width={760} size={28} w={400} color={INK3}>Up to 10%, on a Token-2022 token.</T>
    </frame>,
  ]);

  // ---- T−4: how it trades ------------------------------------------------------------------------------------------------------
  const SHAPES = [
    ['Two market caps', 'M3 45 C 24 43, 42 33, 61 4'],
    ['Amount raised', 'M3 45 C 22 43, 38 31, 48 8 L61 8'],
    ['Two segments', 'M3 45 L22 13 L61 4'],
    ['A middle price', 'M3 45 C 24 43, 42 33, 61 4'],
    ['Liquidity weights', 'M5 45 L5 37 M17 45 L17 31 M29 45 L29 24 M41 45 L41 15 M53 45 L53 5'],
    ['Your own prices', 'M3 44 L17 37 L31 30 L45 15 L61 6'],
  ];
  const TWO_LINES = ['Two market caps', 'Liquidity weights', 'Your own prices'];
  const tile = i => ({ x: 1160 + (i % 2) * 310, y: 470 + Math.floor(i / 2) * 130 });
  const order = [0, 1, 2, 3, 4, 5, 0];
  const hx = [{ at: 0, value: 0 }], hy = [{ at: 0, value: 0 }];
  order.slice(1).forEach((i, n) => {
    const t = 1.8 + n * 0.38, from = tile(order[n]), to = tile(i);
    hx.push({ at: t, value: from.x - 1160 }, { at: t + 0.3, value: to.x - 1160 });
    hy.push({ at: t, value: from.y - 470 }, { at: t + 0.3, value: to.y - 470 });
  });
  scene(11.6, 7.5, `T${M}4`, 'How it trades', [
    choice({ x: X0, y: 220, w: 640, label: 'How it trades', options: ['Bonding curve', 'Plain pool'], at: 0.3, moves: [[3.9, 1]] }),
    choice({ x: 1100, y: 220, w: 660, label: 'Traded against', options: ['SOL', 'USDC', 'Any token'], at: 0.5 }),
    <frame x={X0} y={420} width={900} height={420} layout="none" motion={fadeIn(0.7)}>
      <rect x={0} y={418} width={900} height={2} fill={LINE} />
      <rect x={0} y={0} width={2} height={420} fill={LINE} />
      <frame x={0} y={0} width={900} height={420} layout="none" reveal={{ from: 'left', at: 1.0, duration: 1.6, easing: 'smooth' }}>
        <path x={0} y={0} width={900} height={420} d="M4 412 C 400 405, 700 360, 856 44" stroke={{ width: 6, color: INK, cap: 'round' }} />
      </frame>
      <rect x={842} y={30} width={28} height={28} radius={14} fill={INK} animate={show(2.5, 0.2)} />
      <frame x={36} y={262} width={420} height={110} layout="none" motion={fadeIn(1.1, 0.4)}>
        <T x={0} y={0} width={420} size={28} w={500} color={INK3}>Starting market cap</T>
        <T x={0} y={40} width={420} size={52} w={700}>30 SOL</T>
      </frame>
      <frame x={330} y={10} width={450} height={110} layout="none" motion={fadeIn(2.6, 0.4)}>
        <T x={0} y={0} width={450} size={28} w={500} color={INK3} align="right">Graduates at</T>
        <T x={0} y={40} width={450} size={52} w={700} align="right">420 SOL</T>
      </frame>
    </frame>,
    <frame x={1160} y={420} width={600} height={420} layout="none" motion={fadeIn(1.4)}>
      <T x={0} y={0} width={600} size={28} w={500} color={INK3}>Curve shape</T>
    </frame>,
    ...SHAPES.map(([label, d], i) => {
      const { x, y } = tile(i);
      return (
        <frame x={x} y={y} width={290} height={116} layout="none" motion={fadeIn(1.4 + i * 0.08)}>
          <rect x={0} y={0} width={290} height={116} radius={8} fill="#FFFFFF" strokeColor={LINE} strokeWidth={2} />
          <path x={20} y={34} width={64} height={48} d={d} stroke={{ width: 3.5, color: INK, cap: 'round' }} />
          {i === 3 ? <rect x={48} y={64} width={10} height={10} radius={5} fill={INK} /> : null}
          <T x={104} y={TWO_LINES.includes(label) ? 26 : 42} width={170} size={27} w={600}>{label}</T>
        </frame>
      );
    }),
    <rect x={1160} y={470} width={290} height={116} radius={8} fill="rgba(0,0,0,0)" strokeColor={INK} strokeWidth={3}
      animate={[...show(1.5, 0.2), { property: 'offsetX', keyframes: hx, easing: 'house' }, { property: 'offsetY', keyframes: hy, easing: 'house' }]} />,
    <frame x={X0} y={900} width={1600} height={60} layout="none" motion={fadeIn(4.0)}>
      <T x={0} y={0} width={1600} size={40} w={500} color={INK2}>Or a plain pool: your own price range, tokens only, and a start time.</T>
    </frame>,
  ]);

  // ---- T−3: the trading fee ----------------------------------------------------------------------------------------------------
  // Anti-sniper by default: 50% at the first second, falling to 1% in 20 steps over a minute (spec defaults in src/launch/settings.mjs).
  const PX = 880 / 66, level = f => 300 - (f / 50) * 296;
  let stairs = `M0 ${level(50).toFixed(1)}`;
  for (let i = 0; i <= 20; i++) {
    const f = 50 - 2.45 * i, xEnd = i === 20 ? 880 : (i + 1) * 3 * PX;
    stairs += ` L${xEnd.toFixed(1)} ${level(f).toFixed(1)}`;
    if (i < 20) stairs += ` L${xEnd.toFixed(1)} ${level(f - 2.45).toFixed(1)}`;
  }
  const SPLIT = [['7xKX…9fQa', 40, INK], ['Bq3n…T8sW', 25, '#4A4A4A'], ['F5rC…2LdE', 15, '#6B6B6B'], ['9hWm…pK4z', 10, '#8F8F8F'], ['D2vY…cR7j', 10, '#B5B5B5']];
  let sx = 0;
  const segs = SPLIT.map(([, share, color], i) => {
    const w = Math.round((620 - 24) * share / 100), x = sx;
    sx += w + 6;
    return (
      <frame x={1140 + x} y={516} width={w} height={28} layout="none" reveal={{ from: 'left', at: 3.6 + i * 0.15, duration: 0.3, easing: 'house' }}>
        <rect x={0} y={0} width={w} height={28} radius={3} fill={color} />
      </frame>
    );
  });
  scene(19.1, 7.5, `T${M}3`, 'The trading fee', [
    <frame x={X0} y={236} width={880} height={600} layout="none" motion={fadeIn(0.3)}>
      <T x={0} y={0} width={880} size={28} w={500} color={INK3}>The fee over time</T>
      <frame x={0} y={40} width={880} height={130} layout="none"
        motion={{ timeline: { at: 0.8, duration: 2.8 * 60 / 66, easing: { kind: 'steps', count: 20 }, targets: [{ target: 'fee', counter: { from: 50, to: 1, suffix: '%' } }] } }}>
        <frame name="fee" x={0} y={0} width={500} height={130} layout="none"><T x={0} y={0} width={500} size={104} w={700}>50%</T></frame>
      </frame>
      <rect x={0} y={472} width={880} height={2} fill={LINE} />
      <frame x={0} y={170} width={880} height={304} layout="none" reveal={{ from: 'left', at: 0.8, duration: 2.8, easing: 'linear' }}>
        <path x={0} y={0} width={880} height={304} d={stairs} stroke={{ width: 5, color: INK, cap: 'butt' }} />
      </frame>
      <T x={0} y={490} width={300} size={26} w={500} color={INK3}>First second</T>
      <T x={600} y={490} width={200} size={26} w={500} color={INK3} align="right">One minute</T>
      <frame x={0} y={548} width={880} height={50} layout="none" motion={fadeIn(1.4)}>
        <T x={0} y={0} width={880} size={34} w={600}>Anti-sniper protection, on by default.</T>
      </frame>
    </frame>,
    field({ x: 1140, y: 236, w: 620, label: 'Fee after the first minute', value: '1%', at: 0.5 }),
    <frame x={1140} y={372} width={620} height={40} layout="none" motion={fadeIn(0.6)}>
      <T x={0} y={0} width={620} size={26} w={400} color={INK3}>From 0.25% to 99%.</T>
    </frame>,
    <frame x={1140} y={470} width={620} height={40} layout="none" motion={fadeIn(3.4)}>
      <T x={0} y={0} width={620} size={28} w={500} color={INK3}>The fees go to</T>
    </frame>,
    ...segs,
    ...SPLIT.map(([wallet, share, color], i) => (
      <frame x={1140} y={572 + i * 52} width={620} height={48} layout="none" motion={fadeIn(3.7 + i * 0.15, 0.4)}>
        <rect x={0} y={12} width={20} height={20} radius={3} fill={color} />
        <T x={36} y={4} width={400} size={30} w={500} color={INK2}>{wallet}</T>
        <T x={420} y={4} width={200} size={30} w={700} align="right">{`${share}%`}</T>
      </frame>
    )),
  ]);

  // ---- T−2: locks and vesting --------------------------------------------------------------------------------------------------
  const COL = [X0, 707, 1254], CW = 506;
  const VX = 80, VW = 470, steps = 12;
  let vest = `M0 196 L${VX} 196`;
  for (let i = 0; i < steps; i++) {
    const x = VX + (i + 1) * (VW - VX) / steps, yTop = 196 - ((i + 1) / steps) * 190;
    vest += ` L${(x - (VW - VX) / steps).toFixed(1)} ${yTop.toFixed(1)} L${x.toFixed(1)} ${yTop.toFixed(1)}`;
  }
  const lockTile = (i, name, label, note) => (
    <frame x={0} y={84 + i * 128} width={470} height={112} layout="none">
      <rect x={0} y={0} width={470} height={112} radius={8} fill="#FFFFFF" strokeColor={LINE} strokeWidth={2} />
      {icon(name, { x: 26, y: 34, size: 44, color: INK, strokeWidth: 1.6 })}
      <T x={92} y={note ? 22 : 36} width={360} size={34} w={600}>{label}</T>
      {note ? <T x={92} y={64} width={360} size={24} w={400} color={INK3}>{note}</T> : null}
    </frame>
  );
  scene(26.6, 7.0, `T${M}2`, 'Locks and vesting', [
    <frame x={COL[0]} y={236} width={CW} height={560} layout="none" motion={fadeIn(0.3)}>
      <T x={0} y={0} width={CW} size={44} w={700}>Your liquidity</T>
      {lockTile(0, 'lock', 'Locked for good', 'Recommended.')}
      {lockTile(1, 'lock-open', 'Not locked', null)}
      <rect x={0} y={212} width={470} height={112} radius={8} fill="rgba(0,0,0,0)" strokeColor={INK} strokeWidth={3}
        animate={[{ property: 'offsetY', from: 0, to: -128, at: 1.0, duration: 0.32, easing: 'house' }]} />
      <T x={0} y={372} width={470} size={30} w={400} color={INK2}>Or lock part, and vest part over time.</T>
    </frame>,
    <rect x={COL[1] - 30} y={236} width={2} height={560} fill={LINE} />,
    <frame x={COL[1]} y={236} width={CW} height={560} layout="none" motion={fadeIn(1.6)}>
      <T x={0} y={0} width={CW} size={44} w={700}>Vesting</T>
      <rect x={0} y={294} width={VW} height={2} fill={LINE} />
      <frame x={0} y={96} width={VW} height={200} layout="none" reveal={{ from: 'left', at: 1.9, duration: 1.5, easing: 'linear' }}>
        <path x={0} y={0} width={VW} height={200} d={vest} stroke={{ width: 5, color: INK, cap: 'butt' }} />
      </frame>
      {[['Starting after graduation', '30 days'], ['Released in', '12 parts'], ['One part every', '30 days']].map(([k, v], i) => (
        <frame x={0} y={332 + i * 52} width={VW} height={48} layout="none">
          <T x={0} y={4} width={320} size={28} w={500} color={INK3}>{k}</T>
          <T x={300} y={2} width={170} size={30} w={700} align="right">{v}</T>
        </frame>
      ))}
    </frame>,
    <rect x={COL[2] - 30} y={236} width={2} height={560} fill={LINE} />,
    <frame x={COL[2]} y={236} width={CW} height={560} layout="none" motion={fadeIn(3.4)}>
      <T x={0} y={0} width={CW} size={44} w={700}>Your first buy</T>
    </frame>,
    field({ x: COL[2], y: 320, w: 470, label: 'Spend', value: '2 SOL', at: 3.5, typeAt: 3.9 }),
    <frame x={COL[2]} y={472} width={470} height={160} layout="none" motion={fadeIn(3.7)}>
      <T x={0} y={0} width={470} size={30} w={400} color={INK2}>Bought in the launch transaction, before anyone else can trade.</T>
    </frame>,
  ]);

  // ---- T−1: before you sign ----------------------------------------------------------------------------------------------------
  const REVIEW = [
    ['The token', 'Orbit (ORB), 1,000,000,000 tokens'],
    ['How it trades', 'Bonding curve, 30 SOL to 420 SOL'],
    ['The trading fee', '50%, falling to 1% over a minute'],
    ['Your liquidity', 'Locked for good'],
  ];
  scene(33.6, 5.0, `T${M}1`, 'Before you sign', [
    ...REVIEW.map(([k, v], i) => (
      <frame x={X0} y={226 + i * 104} width={1600} height={104} layout="none" motion={fadeIn(0.3 + i * 0.2, 0.4)}>
        <T x={0} y={30} width={420} size={30} w={500} color={INK3}>{k}</T>
        <T x={420} y={26} width={1000} size={38} w={600}>{v}</T>
        {icon('lock', { x: 1470, y: 30, size: 40, color: INK3, strokeWidth: 1.6 })}
        <rect x={1554} y={30} width={44} height={44} radius={8} fill="#FFFFFF" strokeColor={S2} strokeWidth={2} />
        <rect x={1554} y={30} width={44} height={44} radius={8} fill={INK} animate={show(1.4 + i * 0.3, 0.15)} />
        <frame x={1560} y={36} width={32} height={32} layout="none" animate={show(1.45 + i * 0.3, 0.15)}>
          {icon('check', { x: 0, y: 0, size: 32, color: '#FFFFFF', strokeWidth: 2.4 })}
        </frame>
        <rect x={0} y={102} width={1600} height={2} fill={LINE} />
      </frame>
    )),
    <frame x={X0} y={700} width={1600} height={120} layout="none" motion={fadeIn(1.0)}>
      <rect x={0} y={0} width={440} height={100} radius={8} fill={S2} />
      <rect x={0} y={0} width={440} height={100} radius={8} fill={INK} animate={show(2.7, 0.25)} />
      <T x={0} y={27} width={440} size={38} w={700} color="#FFFFFF" align="center">Sign and launch</T>
      <T x={500} y={10} width={1100} size={30} w={400} color={INK2}>Read back from the transactions. You confirm every setting that can never change.</T>
    </frame>,
  ]);

  // ---- T−0: liftoff ------------------------------------------------------------------------------------------------------------
  scene(38.6, 4.5, `T${M}0`, 'Liftoff', [
    ...mark({ x: 640, y: 352, h: 156, at: 0.3 }),
    <T x={808} y={332} width={720} size={176} w={700} motion={{ by: 'character', from: { opacity: 0, y: 30 }, at: 0.8, duration: 0.6, overlap: 0.6, easing: 'house' }}>t-minus</T>,
    <frame x={0} y={590} width={W} height={200} layout="none" motion={fadeIn(1.4, 0.6)}>
      <T x={0} y={0} width={W} size={54} w={400} color={INK2} align="center">Start from a preset. Change anything.</T>
      <T x={0} y={92} width={W} size={78} w={800} align="center">tminus.si</T>
    </frame>,
  ], true);
};
