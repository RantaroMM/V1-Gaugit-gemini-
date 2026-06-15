import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

type SpectrumChartProps = {
  channelCount?: number;
  data: number[];
  onPress?: () => void;
  showPeakLabel?: boolean;
  style?: StyleProp<ViewStyle>;
};

type ChartBounds = {
  left: number;
  right: number;
  top: number;
  yScaleBottom: number;
  xAxisY: number;
  plotWidth: number;
  plotHeight: number;
};

type SpectrumPeak = {
  x: number;
  y: number;
};

const MAX_CHANNEL_COUNT = 4096;
const X_TICK_INTERVAL = 500;
const MIN_FINAL_TICK_DISTANCE = 250;
const X_LABEL_WIDTH = 52;
const HORIZONTAL_SEGMENTS = 16;
const LOG_Y_MIN = 0;
const DEFAULT_LOG_Y_MAX = 1;
const CHART_ASPECT_RATIO = 433 / 793;

const getBounds = (width: number, height: number): ChartBounds => {
  const left = 27;
  const right = width - 8;
  const top = 21;
  const xAxisY = Math.max(height - 44, top + 1);
  const horizontalStep = (xAxisY - top) / (HORIZONTAL_SEGMENTS + 1);
  const yScaleBottom = xAxisY - horizontalStep;

  return {
    left,
    right,
    top,
    yScaleBottom,
    xAxisY,
    plotWidth: Math.max(right - left, 1),
    plotHeight: Math.max(yScaleBottom - top, 1),
  };
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const getDomainMax = (channelCount?: number) => {
  if (typeof channelCount !== 'number' || !Number.isFinite(channelCount)) {
    return MAX_CHANNEL_COUNT;
  }

  return clamp(Math.trunc(channelCount), 1, MAX_CHANNEL_COUNT);
};

const getXTicks = (domainMax: number) => {
  const ticks = [0];

  for (let tick = X_TICK_INTERVAL; tick < domainMax; tick += X_TICK_INTERVAL) {
    if (domainMax - tick >= MIN_FINAL_TICK_DISTANCE) {
      ticks.push(tick);
    }
  }

  if (ticks[ticks.length - 1] !== domainMax) {
    ticks.push(domainMax);
  }

  return ticks;
};

const getX = (xValue: number, bounds: ChartBounds, domainMax: number) => {
  return bounds.left + (xValue / domainMax) * bounds.plotWidth;
};

const getY = (value: number, bounds: ChartBounds, logYMax: number) => {
  const logValue = Math.log10(value);
  const normalized = clamp(
    (logValue - LOG_Y_MIN) / (logYMax - LOG_Y_MIN),
    0,
    1,
  );

  return bounds.yScaleBottom - normalized * bounds.plotHeight;
};

const getLogYMax = (data: number[], domainMax: number) => {
  const maxValue = data.reduce((currentMax, value, index) => {
    if (!Number.isFinite(value) || value <= 0 || index >= domainMax) {
      return currentMax;
    }

    return Math.max(currentMax, value);
  }, 0);

  if (maxValue <= 1) {
    return DEFAULT_LOG_Y_MAX;
  }

  return Math.max(DEFAULT_LOG_Y_MAX, Math.ceil(Math.log10(maxValue)));
};

const getPeak = (data: number[], domainMax: number): SpectrumPeak => {
  return data.reduce<SpectrumPeak>((currentPeak, value, index) => {
    if (!Number.isFinite(value) || index >= domainMax) {
      return currentPeak;
    }

    if (value > currentPeak.y) {
      return { x: index, y: value };
    }

    return currentPeak;
  }, { x: 0, y: 0 });
};

const formatPeakValue = (value: number) => {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
};

export default function SpectrumChart({
  channelCount,
  data,
  onPress,
  showPeakLabel = false,
  style,
}: SpectrumChartProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const bounds = useMemo(
    () => getBounds(size.width, size.height),
    [size.height, size.width],
  );
  const domainMax = useMemo(() => getDomainMax(channelCount), [channelCount]);
  const xTicks = useMemo(() => getXTicks(domainMax), [domainMax]);
  const logYMax = useMemo(() => getLogYMax(data, domainMax), [data, domainMax]);
  const peak = useMemo(
    () => (showPeakLabel ? getPeak(data, domainMax) : null),
    [data, domainMax, showPeakLabel],
  );

  const gridPath = useMemo(() => {
    const path = Skia.Path.Make();

    for (let index = 0; index <= HORIZONTAL_SEGMENTS; index += 1) {
      const y = bounds.top + (bounds.plotHeight * index) / HORIZONTAL_SEGMENTS;
      path.moveTo(bounds.left, y);
      path.lineTo(bounds.right, y);
    }

    xTicks.forEach((tick) => {
      const x = getX(tick, bounds, domainMax);
      path.moveTo(x, bounds.top);
      path.lineTo(x, bounds.xAxisY);
    });

    return path;
  }, [bounds, domainMax, xTicks]);

  const axisPath = useMemo(() => {
    const path = Skia.Path.Make();

    path.moveTo(bounds.left, bounds.top);
    path.lineTo(bounds.left, bounds.xAxisY);
    path.lineTo(bounds.right, bounds.xAxisY);

    return path;
  }, [bounds]);

  const spectrumPath = useMemo(() => {
    const path = Skia.Path.Make();
    let isDrawing = false;

    data.forEach((value, index) => {
      if (!Number.isFinite(value) || index >= domainMax) {
        isDrawing = false;
        return;
      }

      const x = getX(index, bounds, domainMax);
      const y = getY(Math.max(value, 1), bounds, logYMax);

      if (isDrawing) {
        path.lineTo(x, y);
        return;
      }

      path.moveTo(x, y);
      isDrawing = true;
    });

    return path;
  }, [bounds, data, domainMax, logYMax]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setSize({ width, height });
  };

  return (
    <Pressable
      accessibilityLabel="Spectrum chart"
      disabled={!onPress}
      onLayout={handleLayout}
      onPress={onPress}
      style={[styles.container, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={gridPath} color="#2b2b2b" style="stroke" strokeWidth={1} />
        <Path path={axisPath} color="#e8e8e8" style="stroke" strokeWidth={1} />
        <Path
          path={spectrumPath}
          color="#1f7cff"
          style="stroke"
          strokeWidth={2}
        />
      </Canvas>

      <PowerLabel exponent={String(logYMax)} style={{ top: bounds.top - 10 }} />
      <PowerLabel exponent="0" style={{ top: bounds.yScaleBottom - 10 }} />

      {peak ? (
        <Text pointerEvents="none" style={styles.peakLabel}>
          Peak: y={formatPeakValue(peak.y)} x={peak.x}
        </Text>
      ) : null}

      {xTicks.map((tick) => (
        <Text
          key={tick}
          style={[
            styles.xLabel,
            {
              left: clamp(
                getX(tick, bounds, domainMax) - X_LABEL_WIDTH / 2,
                0,
                Math.max(size.width - X_LABEL_WIDTH, 0),
              ),
              top: bounds.xAxisY + 8,
            },
          ]}>
          {tick}
        </Text>
      ))}
    </Pressable>
  );
}

type PowerLabelProps = {
  exponent: string;
  style: StyleProp<ViewStyle>;
};

function PowerLabel({ exponent, style }: PowerLabelProps) {
  return (
    <View pointerEvents="none" style={[styles.powerLabel, style]}>
      <Text style={styles.powerBase}>10</Text>
      <Text style={styles.powerExponent}>{exponent}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    aspectRatio: CHART_ASPECT_RATIO,
    backgroundColor: '#000000',
    maxWidth: 433,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  powerLabel: {
    flexDirection: 'row',
    left: 6,
    position: 'absolute',
  },
  powerBase: {
    color: '#f2f2f2',
    fontSize: 10,
    lineHeight: 12,
  },
  powerExponent: {
    color: '#f2f2f2',
    fontSize: 7,
    lineHeight: 8,
    marginTop: -2,
  },
  peakLabel: {
    color: '#f2f2f2',
    fontSize: 11,
    lineHeight: 13,
    position: 'absolute',
    right: 10,
    textAlign: 'right',
    top: 6,
  },
  xLabel: {
    color: '#f2f2f2',
    fontSize: 9,
    lineHeight: 11,
    position: 'absolute',
    textAlign: 'center',
    width: X_LABEL_WIDTH,
  },
});
