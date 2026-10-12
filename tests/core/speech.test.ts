import { describe, expect, it } from 'vitest';
import {
  createChannel,
  offer,
  pending,
  updateChannel,
  type Priority,
  type Utterance,
} from '../../src/core/speech';

const line = (key: string, priority: Priority, speaker = 'gaz', duration = 2): Utterance => ({
  speaker,
  key,
  text: key,
  mood: 'neutral',
  gesture: 'none',
  duration,
  priority,
});

describe('speech channel', () => {
  it('only ever has one line on screen and plays the queue in order', () => {
    const ch = createChannel();
    const started: string[] = [];
    const start = (u: Utterance) => started.push(u.key);
    offer(ch, line('a', 'react'), 0, start);
    offer(ch, line('b', 'react'), 0.1, start);
    expect(ch.current?.key).toBe('a');
    updateChannel(ch, 2.1, false, start);
    expect(ch.current?.key).toBe('b');
    expect(started).toEqual(['a', 'b']);
  });

  it('a customer order jumps the queue and is never dropped', () => {
    const ch = createChannel();
    const start = () => {};
    offer(ch, line('r1', 'react'), 0, start);
    for (let i = 0; i < 6; i++) offer(ch, line(`q${i}`, 'react'), 0, start);
    const order = line('order', 'order', 'dazza');
    expect(offer(ch, order, 0.2, start)).toBe(true);
    expect(ch.queue[0]).toBe(order);
    expect(pending(ch, order)).toBe(true);
  });

  it('an order cuts a Gaz aside but not another customer', () => {
    const ch = createChannel();
    const start = () => {};
    offer(ch, line('aside', 'ambient'), 0, start);
    const order = line('order', 'order', 'priya');
    offer(ch, order, 0.3, start);
    expect(ch.current).toBe(order);
    const second = line('order2', 'order', 'beryl');
    offer(ch, second, 0.4, start);
    expect(ch.current).toBe(order);
    expect(ch.queue[0]).toBe(second);
  });

  it('live reactions never stomp on unread lines and are rate limited', () => {
    const ch = createChannel();
    const start = () => {};
    offer(ch, line('order', 'order', 'dazza', 3), 0, start);
    expect(offer(ch, line('live', 'live'), 0.5, start)).toBe(false);
    const ch2 = createChannel();
    offer(ch2, line('gaz', 'live', 'gaz', 2), 0, start);
    expect(offer(ch2, line('too-soon', 'live'), 0.5, start)).toBe(false);
    expect(offer(ch2, line('ok', 'live'), 1.6, start)).toBe(true);
    expect(ch2.current?.key).toBe('ok');
  });

  it('ambient lines only fill silence', () => {
    const ch = createChannel();
    const start = () => {};
    offer(ch, line('talking', 'react'), 0, start);
    expect(offer(ch, line('nag', 'ambient'), 0.1, start)).toBe(false);
    updateChannel(ch, 2.1, false, start);
    expect(offer(ch, line('nag', 'ambient'), 2.2, start)).toBe(true);
  });
});
