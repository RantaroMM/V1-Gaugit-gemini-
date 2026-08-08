import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
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

type ChartViewport = {
  start: number;
  end: number;
};

type ChartCursor = {
  channel: number;
  value: number;
  x: number;
  y: number;
};

type XTickLabel = {
  left: number;
  tick: number;
};

type PinchGestureState = {
  focusChannel: number;
  hasMoved: boolean;
  mode: 'cursor' | 'pinch' | null;
  startDistance: number;
  startViewport: ChartViewport;
};

type ZoomButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
};

const MAX_CHANNEL_COUNT = 4096;
const X_LABEL_WIDTH = 52;
const X_LABEL_GAP = 8;
const HORIZONTAL_SEGMENTS = 16;
const LOG_Y_MIN = 0;
const DEFAULT_LOG_Y_MAX = 1;
const CHART_ASPECT_RATIO = 433 / 793;
const MIN_VISIBLE_CHANNELS = 16;
const TOOLTIP_WIDTH = 132;
const ZOOM_IN_FACTOR = 0.5;
const ZOOM_OUT_FACTOR = 2;
const MOVE_THRESHOLD = 4;

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

const getViewportRange = (viewport: ChartViewport) => {
  return Math.max(viewport.end - viewport.start, 1);
};

const normalizeViewport = (
  viewport: ChartViewport,
  domainMax: number,
): ChartViewport => {
  const maxRange = Math.max(domainMax, 1);
  const minRange = Math.min(MIN_VISIBLE_CHANNELS, maxRange);
  const range = clamp(getViewportRange(viewport), minRange, maxRange);
  const start = clamp(viewport.start, 0, Math.max(maxRange - range, 0));

  return {
    start,
    end: start + range,
  };
};

const getDefaultViewport = (domainMax: number): ChartViewport => ({
  start: 0,
  end: Math.max(domainMax, 1),
});

const getNiceTickInterval = (range: number) => {
  const targetTickCount = range > 1500 ? 9 : 5;
  const roughInterval = Math.max(range / targetTickCount, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughInterval));
  const normalized = roughInterval / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
};

const getXTicks = (viewport: ChartViewport, domainMax: number) => {
  const range = getViewportRange(viewport);
  const interval = getNiceTickInterval(range);
  const ticks = new Set<number>();
  const addTick = (tick: number) => {
    ticks.add(clamp(Math.round(tick), 0, domainMax));
  };

  addTick(viewport.start);

  for (
    let tick = Math.ceil(viewport.start / interval) * interval;
    tick <= viewport.end;
    tick += interval
  ) {
    addTick(tick);
  }

  addTick(viewport.end);

  return Array.from(ticks).sort((a, b) => a - b);
};

const getX = (
  xValue: number,
  bounds: ChartBounds,
  viewport: ChartViewport,
) => {
  return (
    bounds.left +
    ((xValue - viewport.start) / getViewportRange(viewport)) * bounds.plotWidth
  );
};

const getXTickLabelLeft = (
  tick: number,
  bounds: ChartBounds,
  viewport: ChartViewport,
  chartWidth: number,
) => {
  return clamp(
    getX(tick, bounds, viewport) - X_LABEL_WIDTH / 2,
    0,
    Math.max(chartWidth - X_LABEL_WIDTH, 0),
  );
};

const getXTickLabels = (
  ticks: number[],
  bounds: ChartBounds,
  viewport: ChartViewport,
  chartWidth: number,
) => {
  const labels: XTickLabel[] = [];
  let lastRight = Number.NEGATIVE_INFINITY;

  ticks.forEach((tick) => {
    const left = getXTickLabelLeft(tick, bounds, viewport, chartWidth);

    if (left < lastRight + X_LABEL_GAP) {
      return;
    }

    labels.push({ left, tick });
    lastRight = left + X_LABEL_WIDTH;
  });

  return labels;
};

const getChannelFromX = (
  xValue: number,
  bounds: ChartBounds,
  viewport: ChartViewport,
  domainMax: number,
) => {
  const clampedX = clamp(xValue, bounds.left, bounds.right);
  const channel =
    viewport.start +
    ((clampedX - bounds.left) / bounds.plotWidth) * getViewportRange(viewport);

  return clamp(Math.round(channel), 0, Math.max(domainMax - 1, 0));
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

const getLogYMax = (data: number[], viewport: ChartViewport) => {
  const maxValue = data.reduce((currentMax, value, index) => {
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      index < viewport.start ||
      index >= viewport.end
    ) {
      return currentMax;
    }

    return Math.max(currentMax, value);
  }, 0);

  if (maxValue <= 1) {
    return DEFAULT_LOG_Y_MAX;
  }

  return Math.max(DEFAULT_LOG_Y_MAX, Math.ceil(Math.log10(maxValue)));
};

const getPeak = (data: number[], viewport: ChartViewport): SpectrumPeak => {
  return data.reduce<SpectrumPeak>((currentPeak, value, index) => {
    if (
      !Number.isFinite(value) ||
      index < viewport.start ||
      index >= viewport.end
    ) {
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

const getTouchDistance = (
  touches: GestureResponderEvent['nativeEvent']['touches'],
) => {
  if (touches.length < 2) {
    return 0;
  }

  const [firstTouch, secondTouch] = touches;
  const deltaX = secondTouch.locationX - firstTouch.locationX;
  const deltaY = secondTouch.locationY - firstTouch.locationY;

  return Math.hypot(deltaX, deltaY);
};

const getTouchCenterX = (
  touches: GestureResponderEvent['nativeEvent']['touches'],
) => {
  if (touches.length === 0) {
    return 0;
  }

  return (
    touches.reduce((total, touch) => total + touch.locationX, 0) /
    touches.length
  );
};

const getContinuousChannelFromX = (
  xValue: number,
  bounds: ChartBounds,
  viewport: ChartViewport,
) => {
  const clampedX = clamp(xValue, bounds.left, bounds.right);

  return (
    viewport.start +
    ((clampedX - bounds.left) / bounds.plotWidth) * getViewportRange(viewport)
  );
};

export default function SpectrumChart({
  channelCount,
  data,
  onPress,
  showPeakLabel = false,
  style,
}: SpectrumChartProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cursorChannel, setCursorChannel] = useState<number | null>(null);
  const [viewport, setViewport] = useState<ChartViewport>(() =>
    getDefaultViewport(getDomainMax(channelCount)),
  );
  const gestureRef = useRef<PinchGestureState>({
    focusChannel: 0,
    hasMoved: false,
    mode: null,
    startDistance: 0,
    startViewport: getDefaultViewport(getDomainMax(channelCount)),
  });

  const bounds = useMemo(
    () => getBounds(size.width, size.height),
    [size.height, size.width],
  );
  const domainMax = useMemo(() => getDomainMax(channelCount), [channelCount]);
  const normalizedViewport = useMemo(
    () => normalizeViewport(viewport, domainMax),
    [domainMax, viewport],
  );
  const xTicks = useMemo(
    () => getXTicks(normalizedViewport, domainMax),
    [domainMax, normalizedViewport],
  );
  const xTickLabels = useMemo(
    () => getXTickLabels(xTicks, bounds, normalizedViewport, size.width),
    [bounds, normalizedViewport, size.width, xTicks],
  );
  const logYMax = useMemo(
    () => getLogYMax(data, normalizedViewport),
    [data, normalizedViewport],
  );
  const peak = useMemo(
    () => (showPeakLabel ? getPeak(data, normalizedViewport) : null),
    [data, normalizedViewport, showPeakLabel],
  );
  const visibleRange = getViewportRange(normalizedViewport);
  const isZoomed = visibleRange < domainMax - 0.5;
  const minVisibleRange = Math.min(MIN_VISIBLE_CHANNELS, domainMax);
  const canZoomIn = visibleRange > minVisibleRange + 0.5;
  const canZoomOut = isZoomed;

  useEffect(() => {
    setViewport((currentViewport) =>
      normalizeViewport(currentViewport, domainMax),
    );
    setCursorChannel((currentChannel) => {
      if (currentChannel === null) {
        return null;
      }

      return clamp(currentChannel, 0, Math.max(domainMax - 1, 0));
    });
  }, [domainMax]);

  const cursorPoint = useMemo<ChartCursor | null>(() => {
    if (
      cursorChannel === null ||
      cursorChannel < normalizedViewport.start ||
      cursorChannel >= normalizedViewport.end
    ) {
      return null;
    }

    const rawValue = data[cursorChannel];
    const value = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;

    return {
      channel: cursorChannel,
      value,
      x: getX(cursorChannel, bounds, normalizedViewport),
      y: getY(Math.max(value, 1), bounds, logYMax),
    };
  }, [bounds, cursorChannel, data, logYMax, normalizedViewport]);

  const updateCursorFromX = useCallback(
    (xValue: number) => {
      setCursorChannel(
        getChannelFromX(xValue, bounds, normalizedViewport, domainMax),
      );
    },
    [bounds, domainMax, normalizedViewport],
  );

  const zoomAt = useCallback(
    (factor: number, centerChannel?: number) => {
      const currentRange = getViewportRange(normalizedViewport);
      const nextRange = currentRange * factor;
      const center =
        typeof centerChannel === 'number'
          ? centerChannel
          : cursorPoint
            ? cursorPoint.channel
            : normalizedViewport.start + currentRange / 2;

      setViewport(
        normalizeViewport(
          {
            start: center - nextRange / 2,
            end: center + nextRange / 2,
          },
          domainMax,
        ),
      );
    },
    [cursorPoint, domainMax, normalizedViewport],
  );

  const resetZoom = useCallback(() => {
    setViewport(getDefaultViewport(domainMax));
  }, [domainMax]);

  const startPinch = useCallback(
    (event: GestureResponderEvent) => {
      const { touches } = event.nativeEvent;
      const centerX = getTouchCenterX(touches);
      const distance = getTouchDistance(touches);

      gestureRef.current = {
        focusChannel: getContinuousChannelFromX(
          centerX,
          bounds,
          normalizedViewport,
        ),
        hasMoved: true,
        mode: 'pinch',
        startDistance: distance,
        startViewport: normalizedViewport,
      };
    },
    [bounds, normalizedViewport],
  );

  const updatePinch = useCallback(
    (event: GestureResponderEvent) => {
      const { touches } = event.nativeEvent;
      const gesture = gestureRef.current;

      if (touches.length < 2 || gesture.startDistance <= 0) {
        return;
      }

      const nextDistance = getTouchDistance(touches);
      const nextCenterX = getTouchCenterX(touches);
      const nextRange =
        getViewportRange(gesture.startViewport) *
        (gesture.startDistance / Math.max(nextDistance, 1));
      const nextStart =
        gesture.focusChannel -
        ((clamp(nextCenterX, bounds.left, bounds.right) - bounds.left) /
          bounds.plotWidth) *
          nextRange;
      const nextViewport = normalizeViewport(
        {
          start: nextStart,
          end: nextStart + nextRange,
        },
        domainMax,
      );

      setViewport(nextViewport);
      setCursorChannel(
        getChannelFromX(nextCenterX, bounds, nextViewport, domainMax),
      );
    },
    [bounds, domainMax],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          if (event.nativeEvent.touches.length >= 2) {
            startPinch(event);
            return;
          }

          gestureRef.current = {
            focusChannel: 0,
            hasMoved: false,
            mode: 'cursor',
            startDistance: 0,
            startViewport: normalizedViewport,
          };
          updateCursorFromX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event, gestureState) => {
          if (
            Math.abs(gestureState.dx) > MOVE_THRESHOLD ||
            Math.abs(gestureState.dy) > MOVE_THRESHOLD
          ) {
            gestureRef.current.hasMoved = true;
          }

          if (event.nativeEvent.touches.length >= 2) {
            if (gestureRef.current.mode !== 'pinch') {
              startPinch(event);
              return;
            }

            updatePinch(event);
            return;
          }

          gestureRef.current.mode = 'cursor';
          updateCursorFromX(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          if (onPress && !gestureRef.current.hasMoved) {
            onPress();
          }

          gestureRef.current.mode = null;
        },
        onPanResponderTerminate: () => {
          gestureRef.current.mode = null;
        },
      }),
    [normalizedViewport, onPress, startPinch, updateCursorFromX, updatePinch],
  );

  const gridPath = useMemo(() => {
    const path = Skia.Path.Make();

    for (let index = 0; index <= HORIZONTAL_SEGMENTS; index += 1) {
      const y = bounds.top + (bounds.plotHeight * index) / HORIZONTAL_SEGMENTS;
      path.moveTo(bounds.left, y);
      path.lineTo(bounds.right, y);
    }

    xTicks.forEach((tick) => {
      const x = getX(tick, bounds, normalizedViewport);
      path.moveTo(x, bounds.top);
      path.lineTo(x, bounds.xAxisY);
    });

    return path;
  }, [bounds, normalizedViewport, xTicks]);

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
      if (
        !Number.isFinite(value) ||
        index < normalizedViewport.start ||
        index >= normalizedViewport.end
      ) {
        isDrawing = false;
        return;
      }

      const x = getX(index, bounds, normalizedViewport);
      const y = getY(Math.max(value, 1), bounds, logYMax);

      if (isDrawing) {
        path.lineTo(x, y);
        return;
      }

      path.moveTo(x, y);
      isDrawing = true;
    });

    return path;
  }, [bounds, data, logYMax, normalizedViewport]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setSize({ width, height });
  };

  return (
    <View
      accessibilityLabel="Spectrum chart"
      onLayout={handleLayout}
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

      {cursorPoint ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.cursorLine,
              {
                height: bounds.xAxisY - bounds.top,
                left: cursorPoint.x,
                top: bounds.top,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cursorDot,
              {
                left: cursorPoint.x - 6,
                top: cursorPoint.y - 6,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cursorTooltip,
              {
                left: clamp(
                  cursorPoint.x - TOOLTIP_WIDTH / 2,
                  4,
                  Math.max(size.width - TOOLTIP_WIDTH - 4, 4),
                ),
                top: bounds.top + 8,
              },
            ]}>
            <Text style={styles.cursorTooltipTitle}>
              Canal {cursorPoint.channel}
            </Text>
            <Text style={styles.cursorTooltipValue}>
              {formatPeakValue(cursorPoint.value)} contagens
            </Text>
          </View>
        </>
      ) : null}

      {xTickLabels.map(({ left, tick }) => (
        <Text
          key={tick}
          style={[
            styles.xLabel,
            {
              left,
              top: bounds.xAxisY + 8,
            },
          ]}>
          {tick}
        </Text>
      ))}

      <View style={styles.touchLayer} {...panResponder.panHandlers} />

      <View style={styles.zoomControls}>
        <ZoomButton
          accessibilityLabel="Aumentar zoom"
          disabled={!canZoomIn}
          iconName="magnify-plus-outline"
          onPress={() => zoomAt(ZOOM_IN_FACTOR)}
        />
        <ZoomButton
          accessibilityLabel="Diminuir zoom"
          disabled={!canZoomOut}
          iconName="magnify-minus-outline"
          onPress={() => zoomAt(ZOOM_OUT_FACTOR)}
        />
        <ZoomButton
          accessibilityLabel="Resetar zoom"
          disabled={!isZoomed}
          iconName="fit-to-page-outline"
          onPress={resetZoom}
        />
      </View>
    </View>
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

function ZoomButton({
  accessibilityLabel,
  disabled = false,
  iconName,
  onPress,
}: ZoomButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.zoomButton,
        disabled && styles.zoomButtonDisabled,
        pressed && styles.zoomButtonPressed,
      ]}>
      <MaterialCommunityIcons
        name={iconName}
        size={18}
        color={disabled ? '#555555' : '#f2f2f2'}
      />
    </Pressable>
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
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
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
  cursorLine: {
    borderColor: '#f2f2f2',
    borderLeftWidth: 1,
    borderStyle: 'dotted',
    opacity: 0.92,
    position: 'absolute',
    width: 1,
  },
  cursorDot: {
    width: 12,
    height: 12,
    backgroundColor: '#1f7cff',
    borderColor: '#f2f2f2',
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
  },
  cursorTooltip: {
    width: TOOLTIP_WIDTH,
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: '#2e2e2e',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
  },
  cursorTooltipTitle: {
    color: '#f2f2f2',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  cursorTooltipValue: {
    color: '#9BA1A6',
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  zoomControls: {
    flexDirection: 'row',
    gap: 6,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  zoomButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: '#2e2e2e',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  zoomButtonDisabled: {
    opacity: 0.52,
  },
  zoomButtonPressed: {
    opacity: 0.72,
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
