/* eslint-disable no-param-reassign */
import i18next from 'i18next';
import axios from 'axios';
import onChange from 'on-change';
import uniqueId from 'lodash/uniqueId.js';
import { string, setLocale } from 'yup';

import resources from './locales/index.js';
import render from './view.js';
import parser from './parser.js';

const validate = (url, urlList) => {
  const schema = string()
    .trim()
    .required()
    .url()
    .notOneOf(urlList);
  return schema.validate(url);
};

const getAxiosResponse = (url) => {
  const allOrigins = 'https://allorigins.hexlet.app/get';
  const newUrl = new URL(allOrigins);
  newUrl.searchParams.set('url', url);
  newUrl.searchParams.set('disableCache', 'true');
  return axios.get(newUrl);
};

const createPosts = (state, newPosts, feedId) => {
  const preparedPosts = newPosts.map((post) => ({
    ...post,
    feedId,
    id: uniqueId(),
  }));

  state.content.posts = [...state.content.posts, ...preparedPosts];
};

const timeout = 5000;
const getNewPosts = (state) => {
  const allFeeds = state.content.feeds;
  allFeeds
    .map(({ link, feedId }) => getAxiosResponse(link)
      .then((response) => {
        const { posts } = parser(response.data.contents);
        const addedPosts = state.content.posts.map((post) => post.link);
        const newPosts = posts.filter((post) => !addedPosts.includes(post.link));
        if (newPosts.length > 0) {
          createPosts(state, newPosts, feedId);
        }
        return Promise.resolve();
      }));

  Promise.allSettled(allFeeds)
    .finally(() => {
      setTimeout(() => getNewPosts(state), timeout);
    });
};

export default () => {
  const defaultLanguage = 'ru';

  const i18nInstance = i18next.createInstance();
  i18nInstance
    .init({
      lng: defaultLanguage,
      debug: true,
      resources,
    })
    .then(() => {
      const elements = {
        form: document.querySelector('.rss-form'),
        input: document.querySelector('input[id="url-input"]'),
        button: document.querySelector('button[type="submit"]'),
        feedback: document.querySelector('.feedback'),
        feeds: document.querySelector('.feeds'),
        posts: document.querySelector('.posts'),
        modal: {
          modalWindow: document.querySelector('.modal'),
          title: document.querySelector('.modal-title'),
          body: document.querySelector('.modal-body'),
          button: document.querySelector('.full-article'),
        },
      };

      const initialState = {
        inputValue: '',
        valid: true,
        process: {
          processState: 'filling',
          error: '',
        },
        content: {
          posts: [],
          feeds: [],
        },
        uiState: {
          alreadyVisitedLink: new Set(),
          modalId: '',
        },
      };

      const watchedState = onChange(
        initialState,
        render(elements, initialState, i18nInstance),
      );

      getNewPosts(watchedState);

      setLocale({
        mixed: {
          notOneOf: 'exist',
        },
        string: {
          url: 'urlError',
        },
      });

      elements.form.addEventListener('input', (e) => {
        e.preventDefault();
        watchedState.process.processState = 'filling';
        watchedState.inputValue = e.target.value;
      });

      elements.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const urlList = watchedState.content.feeds.map(({ link }) => link);

        validate(watchedState.inputValue, urlList)
          .then(() => {
            watchedState.valid = true;
            watchedState.process.processState = 'sending';
            return getAxiosResponse(watchedState.inputValue);
          })

          .then((response) => {
            const data = response.data.contents;
            const { feed, posts } = parser(data, i18nInstance, elements);

            const feedId = uniqueId();

            watchedState.content.feeds.push({
              ...feed,
              feedId,
              link: watchedState.inputValue,
            });
            createPosts(watchedState, posts, feedId);

            watchedState.process.processState = 'finished';
          })
          .catch((error) => {
            watchedState.valid = false;
            watchedState.process.error = error.message ?? 'defaultError';
            watchedState.process.processState = 'error';
          });
      });

      elements.posts.addEventListener('click', (e) => {
        const currentPostId = e.target.dataset.id;
        watchedState.uiState.alreadyVisitedLink.add(currentPostId);
      });

      elements.modal.modalWindow.addEventListener('show.bs.modal', (e) => {
        const currentPostId = e.relatedTarget.getAttribute('data-id');
        watchedState.uiState.alreadyVisitedLink.add(currentPostId);
        watchedState.uiState.modalId = currentPostId;
      });
    });
};
