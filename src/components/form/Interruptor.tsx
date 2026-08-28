import { StyleSheet, Switch, Text, View } from 'react-native';

interface InterruptorProps {
  label: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
  desabilitado?: boolean;
  /** Explica por que está desabilitado — some quando volta a ficar disponível. */
  ajuda?: string;
}

export function Interruptor({ label, valor, onChange, desabilitado, ajuda }: InterruptorProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textos}>
        <Text style={[styles.label, desabilitado && styles.labelDesabilitado]}>{label}</Text>
        {desabilitado && ajuda ? <Text style={styles.ajuda}>{ajuda}</Text> : null}
      </View>
      <Switch
        value={valor}
        onValueChange={onChange}
        disabled={desabilitado}
        trackColor={{ true: '#1c3d5a' }}
      />
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
  textos: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 13,
    color: '#333',
  },
  labelDesabilitado: {
    color: '#a8b2bb',
  },
  ajuda: {
    fontSize: 11,
    color: '#a8b2bb',
    marginTop: 2,
  },
});
