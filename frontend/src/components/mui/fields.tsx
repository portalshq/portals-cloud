'use client'

import {styled} from '@mui/material/styles'
import Checkbox, {type CheckboxProps} from '@mui/material/Checkbox'
import TextField, {type TextFieldProps} from '@mui/material/TextField'

const inputFonts = {
  fontSize: 16,
  lineHeight: 1.25,
  fontFamily: 'var(--font-sans, Geist, -apple-system, sans-serif)',
}

type FieldProps = TextFieldProps & {resizable?: boolean}

function resizeSx(resizable?: boolean, extra?: TextFieldProps['sx']): TextFieldProps['sx'] {
  return {
    ...(resizable ? {'& .MuiOutlinedInput-input': {resize: 'vertical'}} : null),
    ...extra,
  }
}

const StyledLeadTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== 'resizable',
})({
  width: '100%',
  marginTop: '0.5625rem',
  '& .MuiOutlinedInput-root': {
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 0,
    minHeight: 48,
    color: '#ffffff',
    ...inputFonts,
    '& fieldset': {border: 'none'},
    '&:hover fieldset': {border: 'none'},
    '&.Mui-focused fieldset': {border: 'none'},
    '&.Mui-focused': {boxShadow: '0 0 0 2px #9cdeee'},
  },
  '& .MuiOutlinedInput-input': {
    padding: '12px 14px',
    color: '#ffffff',
    '&::placeholder': {color: '#ffffff', opacity: 1},
  },
  '& .MuiNativeSelect-select': {
    padding: '12px 32px 12px 14px',
  },
  '& .MuiNativeSelect-icon': {color: 'rgba(255,255,255,0.8)'},
})

export function LeadTextField({resizable = false, ...props}: FieldProps) {
  return <StyledLeadTextField {...props} sx={resizeSx(resizable, props.sx)} />
}

export function LeadTextareaField({resizable = true, ...props}: FieldProps) {
  return (
    <StyledLeadTextField {...props} multiline sx={resizeSx(resizable, props.sx)} />
  )
}

export function LeadSelectField(props: TextFieldProps) {
  return (
    <StyledLeadTextField {...props} select slotProps={{select: {native: true}}} />
  )
}

const StyledRoomTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== 'resizable',
})({
  width: '100%',
  '& .MuiOutlinedInput-root': {
    borderRadius: 4,
    backgroundColor: '#ffffff',
    padding: 0,
    minHeight: 40,
    ...inputFonts,
    color: '#07112C',
    '& fieldset': {border: '1px solid #D9E1EC'},
    '&:hover fieldset': {border: '1px solid #D9E1EC'},
    '&.Mui-focused fieldset': {border: '1px solid #2F66B5'},
  },
  '& .MuiOutlinedInput-input': {
    padding: '8px 10px',
    color: '#07112C',
    '&::placeholder': {color: '#AEB9CA', opacity: 1},
  },
  '& .MuiNativeSelect-icon': {color: '#07112C'},
  '& .MuiNativeSelect-select': {
    padding: '8px 32px 8px 10px',
  },
})

export function RoomTextField({resizable = false, ...props}: FieldProps) {
  return <StyledRoomTextField {...props} sx={resizeSx(resizable, props.sx)} />
}

export function RoomTextareaField({resizable = true, ...props}: FieldProps) {
  return <StyledRoomTextField {...props} multiline sx={resizeSx(resizable, props.sx)} />
}

export function RoomSelectField(props: TextFieldProps) {
  return (
    <StyledRoomTextField {...props} select slotProps={{select: {native: true}}} />
  )
}

const StyledConsoleTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== 'resizable',
})({
  width: '100%',
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
    backgroundColor: 'var(--color-background, #101010)',
    border: '1px solid var(--color-border, #ffffff)',
    padding: 0,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontSize: '0.75rem',
    color: 'var(--color-foreground, #ffffff)',
    '& fieldset': {border: 'none'},
    '&:hover fieldset': {border: 'none'},
    '&.Mui-focused fieldset': {border: 'none'},
    '&.Mui-focused': {borderColor: 'var(--color-secondary, #97c6f2)'},
  },
  '& .MuiOutlinedInput-input': {
    padding: '8px 12px',
    color: 'var(--color-foreground, #ffffff)',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    '&::placeholder': {color: 'var(--color-muted-foreground, #595959)', opacity: 1},
  },
  '& .MuiNativeSelect-icon': {color: 'var(--color-muted-foreground, #595959)'},
})

export function ConsoleTextField({resizable = false, ...props}: FieldProps) {
  return <StyledConsoleTextField {...props} sx={resizeSx(resizable, props.sx)} />
}

export function ConsoleTextareaField({resizable = false, ...props}: FieldProps) {
  return (
    <StyledConsoleTextField {...props} multiline sx={resizeSx(resizable, props.sx)} />
  )
}

const StyledLeadCheckbox = styled(Checkbox)({
  padding: 0,
  marginTop: '0.1875rem',
  color: '#ccfffa',
  flexShrink: 0,
  '& .MuiSvgIcon-root': {fontSize: 16},
})

export function LeadCheckbox(props: CheckboxProps) {
  return <StyledLeadCheckbox {...props} />
}

const StyledRoomCheckbox = styled(Checkbox)({
  padding: 0,
  color: '#ccfffa',
  flexShrink: 0,
  '& .MuiSvgIcon-root': {fontSize: 16},
})

export function RoomCheckbox(props: CheckboxProps) {
  return <StyledRoomCheckbox {...props} />
}