#!/usr/bin/env python3
"""Beat map for a topbar show: every beat of a song, plus what each bar sounds like.

    pip install librosa
    python3 scripts/song-beatmap.py music/lobby/Song.mp3 --drop 20.07 > public/shows/song.json

Songs made with AI tools often drift in tempo (Looks Good To Me runs from about 118 to
123 BPM), so the show uses the real beat times instead of a fixed BPM.

--drop is a time (seconds) on a downbeat, usually where the bass first comes in; bars
are counted in fours from the beat nearest to it. Each bar gets a kind from its
sub-bass level: d = drop (full bass), g = groove (some bass), b = break (no bass),
and an energy digit 0-9 from its loudness. Check the result by ear and hand-edit
the "bars" string if a section reads wrong.
"""
import argparse
import json
import sys

import librosa
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio')
    ap.add_argument('--drop', type=float, required=True, help='a downbeat, in seconds')
    ap.add_argument('--bpm', type=float, default=120, help='rough tempo to start from')
    ap.add_argument('--title', default='')
    ap.add_argument('--ignite', type=float, help='where the fire over the logo lights (seconds); default: the drop')
    args = ap.parse_args()

    sr, hop = 22050, 256
    # Decode the way browsers do (ffmpeg trims the encoder delay from the LAME header).
    y, _ = librosa.load(args.audio, sr=sr, mono=True)
    duration = len(y) / sr

    # Kick drum onsets: spectral flux of the low band.
    spec = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = np.log1p(spec[freqs < 200] * 10)
    flux = np.r_[0, np.maximum(0, np.diff(low, axis=1)).sum(0)]
    _, frames = librosa.beat.beat_track(onset_envelope=flux, sr=sr, hop_length=hop,
                                        start_bpm=args.bpm, tightness=800, trim=False)
    raw = librosa.frames_to_time(frames, sr=sr, hop_length=hop)
    raw = raw[raw < duration - 0.05]

    # Smooth out tracker jitter while following tempo changes: local line through +-6 beats.
    n = len(raw)
    idx = np.arange(n)
    beats = raw.copy()
    for k in range(n):
        a, b = max(0, k - 6), min(n, k + 7)
        beats[k] = np.polyval(np.polyfit(idx[a:b], raw[a:b], 1), k)

    # The tracker lands a little early and wobbles at section changes. Snap each beat to
    # its kick where the kick is clear, then draw the local line through those kicks.
    hop_f = 128
    spec_f = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop_f))
    freqs_f = librosa.fft_frequencies(sr=sr, n_fft=1024)
    low_f = np.log1p(spec_f[freqs_f < 150] * 10)
    flux_f = np.r_[0, np.maximum(0, np.diff(low_f, axis=1)).sum(0)]
    t_f = librosa.frames_to_time(np.arange(len(flux_f)), sr=sr, hop_length=hop_f)
    kick = np.full(n, np.nan)
    for k, t in enumerate(beats):
        m = (t_f > t - 0.07) & (t_f < t + 0.07)
        if not m.any():
            continue
        j = np.argmax(flux_f[m])
        around = np.median(flux_f[(t_f > t - 1) & (t_f < t + 1)]) + 1e-9
        if flux_f[m][j] / around > 4:
            kick[k] = t_f[m][j]
    refined = beats.copy()
    for k in range(n):
        a, b = max(0, k - 8), min(n, k + 9)
        ok = ~np.isnan(kick[a:b])
        if ok.sum() >= 5:
            refined[k] = np.polyval(np.polyfit(idx[a:b][ok], kick[a:b][ok], 1), k)
    # One last gentle pass so neighbouring beats never zigzag.
    beats = refined.copy()
    for k in range(n):
        a, b = max(0, k - 4), min(n, k + 5)
        beats[k] = np.polyval(np.polyfit(idx[a:b], refined[a:b], 1), k)

    drop_beat = int(np.argmin(np.abs(beats - args.drop)))
    first_bar = drop_beat % 4
    # The drop itself is the one moment that must land exactly: take its own kick.
    m = (t_f > beats[drop_beat] - 0.08) & (t_f < beats[drop_beat] + 0.08)
    drop_time = float(t_f[m][np.argmax(flux_f[m])]) if m.any() else float(beats[drop_beat])
    ignite_beat = int(np.argmin(np.abs(beats - args.ignite))) if args.ignite is not None else drop_beat
    m = (t_f > beats[ignite_beat] - 0.08) & (t_f < beats[ignite_beat] + 0.08)
    ignite_time = float(t_f[m][np.argmax(flux_f[m])]) if m.any() else float(beats[ignite_beat])

    # How hard each beat hits, so moves can be as big as the music: the kick on the beat,
    # the snare/clap on the beat (1-5 kHz noise), and the off-beat hi-hat halfway to the next.
    mid_f = np.log1p(spec_f[(freqs_f > 1000) & (freqs_f < 5000)] * 10)
    snare_f = np.r_[0, np.maximum(0, np.diff(mid_f, axis=1)).sum(0)]
    hat_f = np.log1p(spec_f[freqs_f > 7000] * 10)
    hat_f = np.r_[0, np.maximum(0, np.diff(hat_f, axis=1)).sum(0)]

    def peak(env, t, w=0.06):
        mm = (t_f > t - w) & (t_f < t + w)
        return float(env[mm].max()) if mm.any() else 0.0

    def digits(vals):
        vals = np.array(vals)
        lo, hi = np.percentile(vals, 10), np.percentile(vals, 95)
        return ''.join(str(int(np.clip((v - lo) / (hi - lo + 1e-9), 0, 0.999) * 10)) for v in vals)

    kick_s = digits([peak(flux_f, t) for t in beats])
    snare_s = digits([peak(snare_f, t) for t in beats])
    halves = [(beats[k] + beats[k + 1]) / 2 if k + 1 < n else beats[k] + 0.25 for k in range(n)]
    hat_s = digits([peak(hat_f, t, 0.04) for t in halves])

    # Describe each bar: sub-bass decides the kind, loudness the energy.
    hop2 = 512
    spec2 = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop2))
    times = librosa.frames_to_time(np.arange(spec2.shape[1]), sr=sr, hop_length=hop2)
    sub = spec2[freqs < 120].sum(0)
    rms = librosa.feature.rms(y=y, hop_length=hop2)[0]
    kinds, energy = '', ''
    starts = list(range(first_bar, n, 4))
    levels = []
    for s in starts:
        a = beats[s]
        b = beats[s + 4] if s + 4 < n else duration
        m = (times >= a) & (times < b)
        s_level = sub[m].mean() if m.any() else 0
        kinds += 'd' if s_level > 110 else ('g' if s_level > 50 else 'b')
        levels.append(rms[m].mean() if m.any() else 0)
    levels = np.array(levels)
    lo, hi = np.percentile(levels, 5), np.percentile(levels, 95)
    energy = ''.join(str(int(np.clip((v - lo) / (hi - lo + 1e-9), 0, 0.999) * 10)) for v in levels)

    json.dump({
        'title': args.title,
        'duration': round(duration, 3),
        'bpm': round(60 / np.median(np.diff(beats)), 2),
        'dropBeat': drop_beat,
        'dropTime': round(drop_time, 3),
        'igniteBeat': ignite_beat,
        'igniteTime': round(ignite_time, 3),
        'firstBar': first_bar,
        'bars': kinds,
        'energy': energy,
        'kick': kick_s,
        'snare': snare_s,
        'offbeat': hat_s,
        'beats': [round(float(t), 3) for t in beats],
    }, sys.stdout, separators=(',', ':'))
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
