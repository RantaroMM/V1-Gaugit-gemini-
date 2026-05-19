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
  data: number[];
  onPress?: () => void;
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

const X_DOMAIN_MAX = 4400;
const X_TICKS = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
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

const getX = (xValue: number, bounds: ChartBounds) => {
  return bounds.left + (xValue / X_DOMAIN_MAX) * bounds.plotWidth;
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

const getLogYMax = (data: number[]) => {
  const maxValue = data.reduce((currentMax, value) => {
    if (!Number.isFinite(value) || value <= 0) {
      return currentMax;
    }

    return Math.max(currentMax, value);
  }, 0);

  if (maxValue <= 1) {
    return DEFAULT_LOG_Y_MAX;
  }

  return Math.max(DEFAULT_LOG_Y_MAX, Math.ceil(Math.log10(maxValue)));
};

const getPeak = (data: number[]): SpectrumPeak => {
  return data.reduce<SpectrumPeak>((currentPeak, value, index) => {
    if (!Number.isFinite(value) || index > X_DOMAIN_MAX) {
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

export default function SpectrumChart({ data, onPress, style }: SpectrumChartProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const bounds = useMemo(
    () => getBounds(size.width, size.height),
    [size.height, size.width],
  );
  const logYMax = useMemo(() => getLogYMax(data), [data]);
  const peak = useMemo(() => getPeak(data), [data]);

  const gridPath = useMemo(() => {
    const path = Skia.Path.Make();

    for (let index = 0; index <= HORIZONTAL_SEGMENTS; index += 1) {
      const y = bounds.top + (bounds.plotHeight * index) / HORIZONTAL_SEGMENTS;
      path.moveTo(bounds.left, y);
      path.lineTo(bounds.right, y);
    }

    X_TICKS.forEach((tick) => {
      const x = getX(tick, bounds);
      path.moveTo(x, bounds.top);
      path.lineTo(x, bounds.xAxisY);
    });

    return path;
  }, [bounds]);

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
      if (!Number.isFinite(value) || index > X_DOMAIN_MAX) {
        isDrawing = false;
        return;
      }

      const x = getX(index, bounds);
      const y = getY(Math.max(value, 1), bounds, logYMax);

      if (isDrawing) {
        path.lineTo(x, y);
        return;
      }

      path.moveTo(x, y);
      isDrawing = true;
    });

    return path;
  }, [bounds, data, logYMax]);

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

      <Text pointerEvents="none" style={styles.peakLabel}>
        Peak: y={formatPeakValue(peak.y)} x={peak.x}
      </Text>

      {X_TICKS.map((tick) => (
        <Text
          key={tick}
          style={[
            styles.xLabel,
            {
              left: getX(tick, bounds) - 23,
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
    width: 46,
  },
});
