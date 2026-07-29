import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ResourceDocument } from '../types/resource';

const styles = StyleSheet.create({
  page: { padding: 40 },
  title: { fontSize: 24, marginBottom: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 18, marginBottom: 10 },
  text: { fontSize: 12, marginBottom: 5 },
});

export const ResourceTemplate = ({ document }: { document: ResourceDocument }) => (
  <Document>
    <Page style={styles.page}>
      <Text style={styles.title}>{document.title}</Text>
      {document.subtitle && <Text style={styles.subtitle}>{document.subtitle}</Text>}
      <Text style={styles.text}>{document.abstract}</Text>
    </Page>
  </Document>
);
