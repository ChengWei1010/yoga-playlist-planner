export const BUCKET_COLORS = {
  blue:   { bg: '#dbeeff', text: '#1a5f9e' },
  orange: { bg: '#ffecd9', text: '#b85c00' },
  pink:   { bg: '#fce7f3', text: '#9d174d' },
  yellow: { bg: '#fef9c3', text: '#854d0e' },
  purple: { bg: '#ede9fe', text: '#6d28d9' },
  teal:   { bg: '#ccfbf1', text: '#0f766e' },
};

export const defaultRows = [
  { id: 'd1',  bucket: 'Intro',        bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd2',  bucket: 'Integration',  bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd3',  bucket: 'Sun A',        bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd4',  bucket: 'Sun B',        bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd5',  bucket: 'Cardio',       bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd6',  bucket: 'Core',         bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd7',  bucket: 'Squat',        bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd8',  bucket: 'Balance',      bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd9',  bucket: 'Hip',          bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd10', bucket: 'Cool down',    bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd11', bucket: 'Surrender',    bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd12', bucket: 'Savasana',     bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
  { id: 'd13', bucket: 'Ending',       bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' },
];

export const initialRows = [
  { id: '1', bucket: 'Intro', bucketTime: '1 mins', song: 'Opening Titles', songMin: '1:33', posture: '' },
  { id: '2', bucket: 'Integration', bucketTime: '5 mins', song: 'townes', songMin: '2:22', posture: 'Child pose, child left right, thread the needle, cat, cow' },
  { id: '3', bucket: '', bucketTime: '', song: 'Tip Toe', songMin: '3:44', posture: 'Downdog, ragdoll, stand, set intention' },
  { id: '4', bucket: 'Stand', bucketTime: '5 mins', song: '宇宙漫遊', songMin: '3:10', posture: 'Sun A *3' },
  { id: '5', bucket: '', bucketTime: '5 mins', song: 'I pray', songMin: '3:02', posture: 'Sun B *2' },
  { id: '6', bucket: '', bucketTime: '', song: 'THE ONE', songMin: '2:40', posture: '' },
  { id: '7', bucket: 'Plank cardio', bucketTime: '3 mins', song: 'Faster', songMin: '2:49', posture: 'Shoulder taps, toe taps, march, mountain climber, hip dip' },
  { id: '8', bucket: 'Core 1', bucketTime: '3 mins', song: 'Take It', songMin: '3:54', posture: 'Core - basic crunch, yogi bicycles, heel taps, cherry pickers' },
  { id: '9', bucket: '', bucketTime: '3 mins', song: "I'm Good", songMin: '2:55', posture: 'Wide arm pushup, arm circles, chaturanga pushup, diamond pushup' },
  { id: '10', bucket: '', bucketTime: '4 mins', song: 'Head & Heart', songMin: '2:46', posture: 'Squat' },
  { id: '11', bucket: 'Standing sculpt', bucketTime: '3 mins', song: '冰激淩力夢', songMin: '4:10', posture: '3 legged dog RIGHT leg up, legs forward, double lunge, W2, side elbow bend, horse squat\n3 legged dog LEFT leg up, legs forward, double lunge, W2, side elbow bend, star' },
  { id: '12', bucket: 'Floor cardio', bucketTime: '3 mins', song: 'I Feel It', songMin: '2:35', posture: 'Punch, high knees, jumping jacks, skaters' },
  { id: '13', bucket: 'Balance', bucketTime: '3.5 mins', song: 'Take a Drive', songMin: '3:45', posture: 'Tree, one legged tadasana, rotator cuff, runners lunge' },
  { id: '14', bucket: 'Core 2', bucketTime: '3 mins', song: 'EoO', songMin: '3:24', posture: 'Core with blocks - Russian twist, leg raises, thread through legs' },
  { id: '15', bucket: 'Hip', bucketTime: '3 mins', song: 'Si Antes Te H', songMin: '3:15', posture: 'Bridge, bridge with single leg lift, Donkey kicks, fire hydrant' },
  { id: '16', bucket: 'Cool down', bucketTime: '3 mins', song: 'Anticipate', songMin: '3:09', posture: 'Belly down - Swim, superman, frog pose\nBack down - Butterfly legs with blocks below, banana pose left/right' },
  { id: '17', bucket: 'Surrender', bucketTime: '4 mins', song: '満ちてゆく', songMin: '5:18', posture: 'Supine figure 4 stretch, easy twist, happy baby, ball pose' },
  { id: '18', bucket: 'Savasana', bucketTime: '2 mins', song: 'Afterlight', songMin: '4:26', posture: 'Savasana' },
  { id: '19', bucket: 'Ending', bucketTime: '2 mins', song: 'Calm Mind', songMin: '2:29', posture: '' },
];

export function parseSongMin(value) {
  if (!value || typeof value !== 'string') return 0;
  const parts = value.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  }
  return 0;
}

export function formatTotalTime(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}
