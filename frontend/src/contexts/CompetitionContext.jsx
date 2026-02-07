import React, { createContext, useState, useCallback } from 'react';

export const CompetitionContext = createContext();

export const CompetitionProvider = ({ children }) => {
  const [currentEvent, setCurrentEvent] = useState(null);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [categories, setCategories] = useState([]);
  const [matches, setMatches] = useState([]);
  const [fields, setFields] = useState([]);

  const setEvent = useCallback((event) => {
    setCurrentEvent(event);
  }, []);

  const setCategory = useCallback((category) => {
    setCurrentCategory(category);
  }, []);

  const setMatch = useCallback((match) => {
    setCurrentMatch(match);
  }, []);

  const value = {
    currentEvent,
    setEvent,
    currentCategory,
    setCategory,
    currentMatch,
    setMatch,
    categories,
    setCategories,
    matches,
    setMatches,
    fields,
    setFields,
  };

  return (
    <CompetitionContext.Provider value={value}>
      {children}
    </CompetitionContext.Provider>
  );
};

export const useCompetition = () => {
  const context = React.useContext(CompetitionContext);
  if (!context) {
    throw new Error('useCompetition must be used within CompetitionProvider');
  }
  return context;
};
