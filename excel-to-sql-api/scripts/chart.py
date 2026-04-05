"""
Chart generation via matplotlib. All functions return an SVG string.
render_chart(config: dict) -> str (SVG)

config keys:
  chart_type:    bar | bar_grouped | bar_stacked | line | pie |
                 scatter | heatmap | boxplot | waterfall
  csv_data:      raw CSV string with header row
  label_column:  column name for X-axis / categories / pie labels
  value_columns: list of column names for data series
  title:         optional chart title
  params:        dict of chart-specific options
"""

import io
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd
import numpy as np
from typing import Optional

COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
          '#06b6d4', '#f97316', '#84cc16']

THEME_DARK = {
    'bg_fig':    '#111827',
    'bg_axes':   '#1f2937',
    'spine':     '#374151',
    'tick':      '#9ca3af',
    'text':      '#f9fafb',
    'subtext':   '#d1d5db',
    'grid':      '#374151',
    'legend_bg': '#1f2937',
    'legend_ec': '#374151',
    'legend_lc': '#d1d5db',
    'zero_line': '#6b7280',
    'connector': '#6b7280',
    'bar_label': '#d1d5db',
}

THEME_LIGHT = {
    'bg_fig':    '#ffffff',
    'bg_axes':   '#f9fafb',
    'spine':     '#d1d5db',
    'tick':      '#6b7280',
    'text':      '#111827',
    'subtext':   '#374151',
    'grid':      '#e5e7eb',
    'legend_bg': '#ffffff',
    'legend_ec': '#d1d5db',
    'legend_lc': '#374151',
    'zero_line': '#9ca3af',
    'connector': '#9ca3af',
    'bar_label': '#374151',
}


def _load(config: dict) -> tuple:
    df = pd.read_csv(io.StringIO(config['csv_data']))
    label_col = config.get('label_column') or df.columns[0]
    value_cols = config.get('value_columns') or [
        c for c in df.columns if c != label_col and pd.api.types.is_numeric_dtype(df[c])
    ]
    # Coerce value columns to numeric, dropping unparseable values
    for col in value_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    return df, label_col, value_cols


def _fig_to_svg(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format='svg', bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read().decode('utf-8')


def _style(ax, title: Optional[str] = None, t: dict = None):
    if t is None:
        t = THEME_DARK
    ax.set_facecolor(t['bg_axes'])
    ax.figure.patch.set_facecolor(t['bg_fig'])
    for spine in ax.spines.values():
        spine.set_edgecolor(t['spine'])
    ax.tick_params(colors=t['tick'], labelsize=9)
    ax.xaxis.label.set_color(t['tick'])
    ax.yaxis.label.set_color(t['tick'])
    if title:
        ax.set_title(title, color=t['text'], fontsize=12, pad=12)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(
        lambda x, _: f'{x/1e6:.1f}M' if abs(x) >= 1e6
                 else f'{x/1e3:.1f}K' if abs(x) >= 1e3 else f'{x:g}'))


def chart_bar(df, label_col, value_cols, title, params, t):
    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(df))
    ax.bar(x, df[value_cols[0]], color=COLORS[0], alpha=0.9, width=0.6)
    ax.set_xticks(x)
    ax.set_xticklabels(df[label_col], rotation=30, ha='right')
    _style(ax, title or value_cols[0], t)
    return _fig_to_svg(fig)


def chart_bar_grouped(df, label_col, value_cols, title, params, t):
    n = len(value_cols)
    width = 0.8 / n
    fig, ax = plt.subplots(figsize=(max(10, len(df) * 0.8), 5))
    x = np.arange(len(df))
    for i, col in enumerate(value_cols):
        offset = (i - n / 2 + 0.5) * width
        ax.bar(x + offset, df[col], width=width * 0.9,
               color=COLORS[i % len(COLORS)], alpha=0.9, label=col)
    ax.set_xticks(x)
    ax.set_xticklabels(df[label_col], rotation=30, ha='right')
    ax.legend(facecolor=t['legend_bg'], edgecolor=t['legend_ec'], labelcolor=t['legend_lc'], fontsize=9)
    _style(ax, title, t)
    return _fig_to_svg(fig)


def chart_bar_stacked(df, label_col, value_cols, title, params, t):
    fig, ax = plt.subplots(figsize=(max(10, len(df) * 0.8), 5))
    x = np.arange(len(df))
    bottom = np.zeros(len(df))
    for i, col in enumerate(value_cols):
        vals = df[col].fillna(0).values.astype(float)
        ax.bar(x, vals, bottom=bottom, color=COLORS[i % len(COLORS)],
               alpha=0.9, label=col, width=0.6)
        bottom += vals
    ax.set_xticks(x)
    ax.set_xticklabels(df[label_col], rotation=30, ha='right')
    ax.legend(facecolor=t['legend_bg'], edgecolor=t['legend_ec'], labelcolor=t['legend_lc'], fontsize=9)
    _style(ax, title, t)
    return _fig_to_svg(fig)


def chart_line(df, label_col, value_cols, title, params, t):
    fig, ax = plt.subplots(figsize=(10, 5))
    x_labels = df[label_col].astype(str).tolist()
    x = np.arange(len(x_labels))
    for i, col in enumerate(value_cols):
        ax.plot(x, df[col], marker='o', markersize=4,
                color=COLORS[i % len(COLORS)], linewidth=2, label=col)
    ax.set_xticks(x)
    ax.set_xticklabels(x_labels, rotation=30, ha='right')
    if len(value_cols) > 1:
        ax.legend(facecolor=t['legend_bg'], edgecolor=t['legend_ec'], labelcolor=t['legend_lc'], fontsize=9)
    ax.grid(True, color=t['grid'], alpha=0.4, linestyle='--')
    _style(ax, title or value_cols[0], t)
    return _fig_to_svg(fig)


def chart_pie(df, label_col, value_cols, title, params, t):
    col = value_cols[0]
    fig, ax = plt.subplots(figsize=(7, 7))
    wedges, texts, autotexts = ax.pie(
        df[col].abs(), labels=df[label_col],
        autopct='%1.1f%%', colors=COLORS[:len(df)],
        pctdistance=0.82, startangle=90)
    for txt in texts:
        txt.set_color(t['subtext'])
    for at in autotexts:
        at.set_color(t['bg_fig'])
        at.set_fontsize(9)
    ax.figure.patch.set_facecolor(t['bg_fig'])
    if title:
        ax.set_title(title, color=t['text'], fontsize=12, pad=12)
    return _fig_to_svg(fig)


def chart_scatter(df, label_col, value_cols, title, params, t):
    if len(value_cols) < 2:
        raise ValueError("Scatter requires at least 2 numeric columns")
    x_col, y_col = value_cols[0], value_cols[1]
    size_col = value_cols[2] if len(value_cols) > 2 else None
    fig, ax = plt.subplots(figsize=(9, 6))
    sizes = None
    if size_col:
        raw = df[size_col].fillna(0).values.astype(float)
        mn, mx = raw.min(), raw.max()
        sizes = 40 + 300 * ((raw - mn) / (mx - mn + 1e-9))
    ax.scatter(df[x_col], df[y_col], s=sizes if sizes is not None else 60,
               c=COLORS[0], alpha=0.75, edgecolors=t['bg_axes'], linewidth=0.5)
    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.grid(True, color=t['grid'], alpha=0.4, linestyle='--')
    _style(ax, title or f'{x_col} vs {y_col}', t)
    return _fig_to_svg(fig)


def chart_heatmap(df, label_col, value_cols, title, params, t):
    matrix = df[value_cols].apply(pd.to_numeric, errors='coerce').values.astype(float)
    fig, ax = plt.subplots(figsize=(max(8, len(value_cols) * 1.2), max(5, len(df) * 0.6)))
    vmin, vmax = np.nanmin(matrix), np.nanmax(matrix)
    im = ax.imshow(matrix, aspect='auto', cmap='RdYlGn', interpolation='nearest',
                   vmin=vmin, vmax=vmax)
    ax.set_xticks(range(len(value_cols)))
    ax.set_xticklabels(value_cols, rotation=40, ha='right')
    ax.set_yticks(range(len(df)))
    ax.set_yticklabels(df[label_col])
    cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cb.ax.yaxis.set_tick_params(color=t['tick'], labelcolor=t['tick'])
    rng = vmax - vmin if (vmax - vmin) > 0 else 1
    for i in range(len(df)):
        for j in range(len(value_cols)):
            v = matrix[i, j]
            if not math.isnan(v):
                norm = (v - vmin) / rng
                text_color = t['bg_fig'] if 0.3 < norm < 0.7 else t['text']
                ax.text(j, i, f'{v:g}', ha='center', va='center',
                        fontsize=8, color=text_color)
    _style(ax, title, t)
    return _fig_to_svg(fig)


def chart_boxplot(df, label_col, value_cols, title, params, t):
    data = [df[col].dropna().values for col in value_cols]
    fig, ax = plt.subplots(figsize=(max(8, len(value_cols) * 1.5), 6))
    bp = ax.boxplot(data, patch_artist=True, labels=value_cols,
                    medianprops={'color': t['text'], 'linewidth': 2},
                    whiskerprops={'color': t['tick']},
                    capprops={'color': t['tick']},
                    flierprops={'marker': 'o', 'markerfacecolor': '#ef4444',
                                'markersize': 4, 'alpha': 0.5})
    for patch, color in zip(bp['boxes'], COLORS):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax.set_xticklabels(value_cols, rotation=20, ha='right')
    ax.grid(True, axis='y', color=t['grid'], alpha=0.4, linestyle='--')
    _style(ax, title, t)
    return _fig_to_svg(fig)


def chart_waterfall(df, label_col, value_cols, title, params, t):
    col = value_cols[0]
    labels = df[label_col].astype(str).tolist()
    values = df[col].fillna(0).values.astype(float)
    running = 0.0
    bottoms, heights, colors = [], [], []
    for v in values:
        bottoms.append(running if v >= 0 else running + v)
        heights.append(abs(v))
        colors.append(COLORS[0] if v >= 0 else COLORS[3])
        running += v

    fig, ax = plt.subplots(figsize=(max(10, len(values) * 0.9), 5))
    x = np.arange(len(values))
    ax.bar(x, heights, bottom=bottoms, color=colors, alpha=0.85, width=0.6)

    ax.figure.canvas.draw()
    y_range = ax.get_ylim()[1] - ax.get_ylim()[0]
    for i, (h, b, v) in enumerate(zip(heights, bottoms, values)):
        label = f'{v:+.0f}' if abs(v) < 1000 else f'{v / 1000:+.1f}K'
        ax.text(i, b + h + y_range * 0.01, label,
                ha='center', va='bottom', color=t['bar_label'], fontsize=8)

    for i in range(len(x) - 1):
        end = bottoms[i] + heights[i]
        ax.plot([i + 0.3, i + 0.7], [end, end],
                color=t['connector'], linewidth=0.8, linestyle='--')

    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=30, ha='right')
    ax.axhline(0, color=t['zero_line'], linewidth=0.8)
    _style(ax, title or col, t)
    return _fig_to_svg(fig)


CHART_RENDERERS = {
    'bar':         chart_bar,
    'bar_grouped': chart_bar_grouped,
    'bar_stacked': chart_bar_stacked,
    'line':        chart_line,
    'pie':         chart_pie,
    'scatter':     chart_scatter,
    'heatmap':     chart_heatmap,
    'boxplot':     chart_boxplot,
    'waterfall':   chart_waterfall,
}


def render_chart(config: dict) -> str:
    chart_type = config.get('chart_type', 'bar').lower()
    if chart_type not in CHART_RENDERERS:
        raise ValueError(
            f"Unknown chart type '{chart_type}'. Valid: {sorted(CHART_RENDERERS)}")
    df, label_col, value_cols = _load(config)
    if not value_cols:
        raise ValueError("No numeric value columns available for charting.")
    title = config.get('title')
    params = config.get('params') or {}
    t = THEME_LIGHT if config.get('theme') == 'light' else THEME_DARK
    return CHART_RENDERERS[chart_type](df, label_col, value_cols, title, params, t)
