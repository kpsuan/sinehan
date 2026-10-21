import React from 'react';
import { useCurrentFrame } from 'remotion';
import { DARK, Palette } from '../theme';
import { pop } from '../anim';
import { Avatar, I, Icon } from './ui';

// The sidebar's pieces, drawn at its real size (~360px wide); scenes scale them up.

export const Card: React.FC<{ p?: Palette; children: React.ReactNode; style?: React.CSSProperties }> = ({
  p = DARK,
  children,
  style,
}) => (
  <div
    style={{
      borderRadius: 10,
      background: p.card,
      border: `1px solid ${p.edge}`,
      boxShadow: p === DARK ? 'inset 0 1px 0 rgba(255,255,255,.04)' : '0 1px 2px rgba(16,16,24,.04), 0 6px 20px rgba(16,16,24,.05)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const IconBtn: React.FC<{ p?: Palette; d: string; on?: boolean; color?: string; scale?: number }> = ({
  p = DARK,
  d,
  on,
  color,
  scale = 1,
}) => (
  <div
    style={{
      width: 34,
      height: 34,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 7,
      background: on ? 'rgba(201,182,242,.12)' : p.btn,
      border: `1px solid ${on ? 'rgba(201,182,242,.45)' : p === DARK ? 'rgba(255,255,255,.07)' : 'transparent'}`,
      color: color ?? (on ? p.text : p.muted),
      transform: `scale(${scale})`,
    }}
  >
    <Icon d={d} size={18} />
  </div>
);

export const Header: React.FC<{
  p?: Palette;
  together?: boolean;
  status?: string;
  glow?: number;
  linkCopied?: boolean;
  linkScale?: number;
}> = ({ p = DARK, together = true, status, glow = 0, linkCopied, linkScale = 1 }) => (
  <Card
    p={p}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 10px 10px 12px',
      boxShadow: glow ? `inset 0 0 ${40 * glow}px rgba(201,182,242,${0.45 * glow}), 0 0 ${26 * glow}px rgba(201,182,242,${0.3 * glow})` : undefined,
    }}
  >
    <div style={{ display: 'flex' }}>
      <Avatar who="you" size={30} ring={p.card} />
      {together && <Avatar who="them" size={30} ring={p.card} style={{ marginLeft: -8 }} />}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{together ? 'Kismet & Jessa' : 'Kismet'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.muted }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: together ? p.live : '#5a5066',
            boxShadow: together ? `0 0 6px ${p.live}` : undefined,
          }}
        />
        {status ?? (together ? 'Together' : 'Not connected')}
      </div>
    </div>
    <IconBtn p={p} d={linkCopied ? I.check : I.link} color={linkCopied ? p.live : undefined} scale={linkScale} />
    <IconBtn p={p} d={I.history} />
    <IconBtn p={p} d={I.gear} />
  </Card>
);

export const WatchBar: React.FC<{ p?: Palette; title?: string; pressed?: string; pressScale?: number }> = ({
  p = DARK,
  title = 'Sintel',
  pressed,
  pressScale = 1,
}) => (
  <Card p={p} style={{ padding: '10px 8px 8px' }}>
    <div style={{ padding: '0 4px 8px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: p.muted }}>WATCHING</div>
      <div style={{ fontSize: 13, color: p.text }}>{title}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {[
        ['Guides', I.star],
        ['Hold hand', I.heart],
        ['Count in', ''],
        ['Break', I.door],
      ].map(([label, d]) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '7px 2px 6px',
            borderRadius: 7,
            background: pressed === label ? 'rgba(201,182,242,.16)' : p.btn,
            color: pressed === label ? p.text : p.muted,
            fontSize: 11,
            transform: pressed === label ? `scale(${pressScale})` : undefined,
          }}
        >
          {d ? (
            <Icon d={d} size={16} />
          ) : (
            <b style={{ height: 16, fontSize: 12, lineHeight: '16px', color: p.text }}>3·2·1</b>
          )}
          {label}
        </div>
      ))}
    </div>
  </Card>
);

export const CallRow: React.FC<{ p?: Palette }> = ({ p = DARK }) => (
  <Card p={p} style={{ display: 'flex', gap: 6, padding: 6 }}>
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '7px 0',
        borderRadius: 7,
        background: '#c4323e',
        color: '#fff',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <Icon d={I.video} size={16} /> Video call
    </div>
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '7px 0',
        borderRadius: 7,
        background: p.btn,
        color: p.text,
        fontSize: 13,
      }}
    >
      <Icon d={I.phone} size={16} /> Voice call
    </div>
  </Card>
);

export type Line =
  | { kind: 'msg'; who: 'you' | 'them'; text: string; time: string; at: number }
  | { kind: 'sys'; text: string; at: number }
  | { kind: 'emoji'; who: 'you' | 'them'; text: string; time: string; at: number };

// Chat lines pop in at their `at` frame.
export const Chat: React.FC<{ p?: Palette; lines: Line[]; height?: number }> = ({ p = DARK, lines, height = 330 }) => {
  const frame = useCurrentFrame();
  const shown = lines.filter((l) => frame >= l.at);
  return (
    <Card p={p} style={{ height, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 7, padding: 12, overflow: 'hidden' }}>
        {shown.map((l, i) => {
          const s = pop(frame, l.at);
          const origin = l.kind === 'sys' ? 'center' : l.who === 'you' ? 'right bottom' : 'left bottom';
          const wrap: React.CSSProperties = { transform: `scale(${s})`, transformOrigin: origin, opacity: Math.min(1, s * 1.5) };
          if (l.kind === 'sys')
            return (
              <div key={i} style={{ ...wrap, textAlign: 'center', fontSize: 11.5, color: p.faint }}>
                {l.text}
              </div>
            );
          const me = l.who === 'you';
          return (
            <div key={i} style={{ ...wrap, display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: me ? 'row-reverse' : 'row' }}>
              <Avatar who={l.who} size={22} ring={p.card} />
              {l.kind === 'emoji' ? (
                <div style={{ fontSize: 26, lineHeight: 1 }}>{l.text}</div>
              ) : (
                <div
                  style={{
                    maxWidth: '78%',
                    padding: '7px 11px',
                    borderRadius: me ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                    background: me ? p.accent : p.them,
                    color: me ? p.accentInk : p.text,
                    fontSize: 13,
                  }}
                >
                  {!me && <div style={{ fontSize: 11, color: p.muted }}>{'Jessa'}</div>}
                  {l.text}
                  <div
                    style={{
                      display: 'inline-block',
                      marginLeft: 8,
                      padding: '0 5px',
                      borderRadius: 5,
                      fontSize: 10.5,
                      background: me ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.07)',
                      color: me ? p.accentInk : p.muted,
                      opacity: 0.8,
                    }}
                  >
                    {l.time}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: `1px solid ${p.edge}` }}>
        <IconBtn p={p} d={I.smile} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            borderRadius: 7,
            background: p.btn,
            color: p.faint,
            fontSize: 13,
          }}
        >
          Message
        </div>
        <div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 7, background: p.accent, color: p.accentInk }}>
          <Icon d={I.send} size={18} />
        </div>
      </div>
    </Card>
  );
};

// The whole sidebar column.
export const Sidebar: React.FC<{
  p?: Palette;
  lines?: Line[];
  chatHeight?: number;
  glow?: number;
  pressed?: string;
  pressScale?: number;
  title?: string;
}> = ({ p = DARK, lines = [], chatHeight = 330, glow, pressed, pressScale, title }) => (
  <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: p.bg, borderRadius: 14 }}>
    <Header p={p} glow={glow} />
    <WatchBar p={p} pressed={pressed} pressScale={pressScale} title={title} />
    <CallRow p={p} />
    <Chat p={p} lines={lines} height={chatHeight} />
  </div>
);
