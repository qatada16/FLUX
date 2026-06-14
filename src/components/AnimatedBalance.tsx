import React, { useEffect } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// Animated count-up effect for balance numbers.
// Uses Reanimated to smoothly animate from 0 (or previous value) to the target.

const AnimatedText = Animated.createAnimatedComponent(Text);

interface AnimatedBalanceProps {
  value: number;
  prefix?: string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}

export function AnimatedBalance({ value, prefix = 'Rs. ', style, duration = 800 }: AnimatedBalanceProps) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  // Since animatedProps on Text is tricky in RN, we use a simpler approach:
  // re-render based on a state that follows the animation.
  const [displayValue, setDisplayValue] = React.useState(value);

  useEffect(() => {
    // Simple JS-based count-up as a fallback that always works
    const startValue = displayValue;
    const diff = value - startValue;
    const startTime = Date.now();

    if (diff === 0) return;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + diff * eased;
      setDisplayValue(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  const formatted = displayValue.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Text style={style}>
      {prefix}{formatted}
    </Text>
  );
}
