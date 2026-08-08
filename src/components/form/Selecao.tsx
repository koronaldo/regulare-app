import { forwardRef } from 'react';
import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

export interface OpcaoSelecao {
  valor: string | number;
  label: string;
}

interface SelecaoProps {
  label: string;
  valor: string | number | null | undefined;
  opcoes: OpcaoSelecao[];
  onChange: (valor: string) => void;
  obrigatorio?: boolean;
  placeholder?: string;
  erro?: string;
}

export const Selecao = forwardRef<View, SelecaoProps>(function Selecao(
  { label, valor, opcoes, onChange, obrigatorio, placeholder = 'Selecione...', erro },
  ref,
) {
  return (
    <View style={styles.container} ref={ref}>
      <Text style={styles.label}>
        {label}
        {obrigatorio && <Text style={styles.asterisco}> *</Text>}
      </Text>
      <View style={[styles.pickerBorda, erro && styles.pickerBordaErro]}>
        <Picker selectedValue={valor != null ? String(valor) : ''} onValueChange={(v) => onChange(String(v))}>
          <Picker.Item label={placeholder} value="" />
          {opcoes.map((op) => (
            <Picker.Item key={String(op.valor)} label={op.label} value={String(op.valor)} />
          ))}
        </Picker>
      </View>
      {erro && <Text style={styles.erroTexto}>{erro}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#5a6672',
    marginBottom: 4,
    fontWeight: '600',
  },
  asterisco: {
    color: '#b3261e',
  },
  pickerBorda: {
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  pickerBordaErro: {
    borderColor: '#d32f2f',
    borderWidth: 1.5,
  },
  erroTexto: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 4,
  },
});
