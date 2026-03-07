cat ../apps/competition-admin/src/pages/BracketPage.jsx | sed 's/useOutletContext/useContext/g' | sed "s/import { useOutletContext } from 'react-router-dom';/import { useContext } from 'react';\nimport { CentralizatorContext } from '.\/CategoriesLayout';/g" > temp.jsx
mv temp.jsx ../apps/competition-admin/src/pages/BracketPage.jsx
