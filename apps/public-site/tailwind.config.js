import config from '../shared/tailwind.config.js';
export default {
	...config,
	theme: {
		...config.theme,
		extend: {
			...config.theme.extend,
			fontFamily: {
				...config.theme.extend.fontFamily,
				sans: ['Roboto', 'sans-serif'],
				display: ['Roboto', 'sans-serif'],
				mobile: ['Poppins', 'sans-serif'],
			},
			colors: {
				...config.theme.extend.colors,
				// Brand palette matched against the live vovinam.ro (Bricks theme) CSS variables.
				'brand-navy': '#172642',
				'brand-navy-dark': '#071225',
				'brand-gold': '#edb654',
				'brand-red': '#a61f33',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
				secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
				muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
				accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
				card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
				destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
			},
		},
	},
};
