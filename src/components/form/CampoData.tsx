import { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

interface CampoDataProps {
  label: string;
  valor: string | null | undefined;
  onChange: (valorIso: string) => void;
  modo?: 'date' | 'time';
  obrigatorio?: boolean;
  erro?: string;
}

function paraDate(valor: string | null | undefined, modo: 'date' | 'time'): Date {
  if (!valor) return new Date();
  if (modo === 'time') {
    const [h, m] = valor.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatar(valor: string | null | undefined, modo: 'date' | 'time'): string {
  if (!valor) return modo === 'date' ? 'dd/mm/aaaa' : '--:--';
  if (modo === 'time') return valor.slice(0, 5);
  const [ano, mes, dia] = valor.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
}

function paraIso(data: Date, modo: 'date' | 'time'): string {
  if (modo === 'time') {
    return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
  }
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export const CampoData = forwardRef<View, CampoDataProps>(function CampoData(
  { label, valor, onChange, modo = 'date', obrigatorio, erro },
  ref,
) {
  const [mostrarIOS, setMostrarIOS] = useState(false);

  function abrir() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: paraDate(valor, modo),
        mode: modo,
        is24Hour: true,
        onChange: (evento, data) => {
          if (evento.type === 'set' && data) onChange(paraIso(data, modo));
        },
      });
    } else {
      setMostrarIOS(true);
    }
  }

  return (
    <View style={styles.container} ref={ref}>
      <Text style={styles.label}>
        {label}
        {obrigatorio && <Text style={styles.asterisco}> *</Text>}
      </Text>
      <Pressable style={[styles.campo, erro && styles.campoErro]} onPress={abrir}>
        <Text style={valor ? styles.valorTexto : styles.placeholderTexto}>{formatar(valor, modo)}</Text>
      </Pressable>
      {erro && <Text style={styles.erroTexto}>{erro}</Text>}

      {mostrarIOS && (
        <DateTimePicker
          value={paraDate(valor, modo)}
          mode={modo}
          display="spinner"
          onChange={(evento, data) => {
            setMostrarIOS(false);
            if (evento.type === 'set' && data) onChange(paraIso(data, modo));
          }}
        />
      )}
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
  campo: {
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  campoErro: {
    borderColor: '#d32f2f',
    borderWidth: 1.5,
  },
  erroTexto: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 4,
  },
  valorTexto: {
    fontSize: 14,
    color: '#1c3d5a',
  },
  placeholderTexto: {
    fontSize: 14,
    color: '#a8b2bb',
  },
});
