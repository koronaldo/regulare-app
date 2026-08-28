import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

interface CampoProps extends TextInputProps {
  /** Omitido quando o rótulo já vem do título da seção — evita repetir o mesmo texto. */
  label?: string;
  obrigatorio?: boolean;
  erro?: string;
}

export const Campo = forwardRef<TextInput, CampoProps>(function Campo(
  { label, obrigatorio, erro, style, ...resto },
  ref,
) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {obrigatorio && <Text style={styles.asterisco}> *</Text>}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        style={[styles.input, erro && styles.inputErro, style]}
        placeholderTextColor="#a8b2bb"
        {...resto}
      />
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
  input: {
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  inputErro: {
    borderColor: '#d32f2f',
    borderWidth: 1.5,
  },
  erroTexto: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 4,
  },
});
