'use client'

import {createTheme} from '@mui/material/styles'

export const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: '#9cdeee'},
    secondary: {main: '#5bc4ba'},
    error: {main: '#ffb4a8'},
    background: {default: '#101010', paper: '#0f0f0f'},
    text: {primary: '#ffffff', secondary: 'rgba(255,255,255,0.6)'},
  },
  shape: {borderRadius: 3},
  typography: {
    fontFamily: 'var(--font-sans, Geist, -apple-system, sans-serif)',
    fontSize: 16,
    button: {textTransform: 'none'},
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {},
    },
  },
})
