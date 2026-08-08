import { StyleSheet, Switch, Text, View } from 'react-native';

interface InterruptorProps {
  label: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
}

export function Interruptor({ label, valor, onChange }: InterruptorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={valor} onValueChange={onChange} trackColor={{ true: '#1c3d5a' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
});
