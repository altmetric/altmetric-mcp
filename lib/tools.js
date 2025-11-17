import { validateIdentifier } from './validators.js';
import { makeDetailsApiRequest, makeExplorerApiRequest } from './api-client.js';

/**
 * Creates tool definitions and handlers with API configuration
 * @param {Object} config - API configuration
 * @param {string} config.detailsApiKey - Details Page API key
 * @param {string} config.detailsApiBaseUrl - Details Page API base URL
 * @param {string} config.explorerApiKey - Explorer API key
 * @param {string} config.explorerApiSecret - Explorer API secret
 * @param {string} config.explorerApiBaseUrl - Explorer API base URL
 * @returns {Object} Tools object with definitions and handlers
 */
export function createTools(config) {
  const {
    detailsApiKey,
    detailsApiBaseUrl,
    explorerApiKey,
    explorerApiSecret,
    explorerApiBaseUrl,
  } = config;

  return {
    get_citation_counts: {
      definition: {
        name: 'get_citation_counts',
        description: 'Retrieve citation counts and basic metadata for a research output using its DOI, PubMed ID, arXiv ID, or other identifier. Returns citation metrics across various platforms (Twitter, news, blogs, policy documents, etc.). Available with free tier API keys.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'The identifier for the research output (e.g., DOI: "10.1038/nature12373", PubMed ID: "123456", arXiv ID: "1234.5678")',
            },
            identifier_type: {
              type: 'string',
              enum: ['doi', 'pmid', 'arxiv', 'id', 'ads', 'handle', 'nct_id', 'repec', 'urn', 'uri', 'isbn', 'ssrn', 'dimensions_publication_id'],
              description: 'The type of identifier being used. "id" refers to the Altmetric attention score ID. Supported types: DOI, PubMed ID, arXiv ID, ADS Bibcode, Handle, NCT ID, RePEc, URN, URI, ISBN, SSRN, Dimensions Publication ID.',
              default: 'doi',
            },
          },
          required: ['identifier'],
        },
      },
      handler: async (args) => {
        const { identifier, identifier_type = 'doi' } = args;
        validateIdentifier(identifier, identifier_type);
        const endpoint = `/v1/${identifier_type}/${encodeURIComponent(identifier)}`;
        const data = await makeDetailsApiRequest(endpoint, {}, detailsApiKey, detailsApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    get_citation_details: {
      definition: {
        name: 'get_citation_details',
        description: 'Retrieve detailed citation information including full text of mentions, author details, and complete metadata for a research output. This is a commercial feature requiring a paid API key. Returns comprehensive data about each mention across all tracked platforms. Note: This endpoint does not support pagination and returns all data at once.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'The identifier for the research output (e.g., DOI: "10.1038/nature12373", Altmetric ID: "123456")',
            },
            identifier_type: {
              type: 'string',
              enum: ['doi', 'id'],
              description: 'The type of identifier being used. "id" refers to the Altmetric attention score ID.',
              default: 'doi',
            },
            include_sources: {
              type: 'string',
              description: 'Comma-separated list of sources to include in the response (e.g., "twitter,news,blogs"). Use this to limit response size. Available sources: facebook, blogs, linkedin, video, pinterest, gplus, twitter, bluesky, reddit, news, f1000, rh, qna, forum, peer_reviews, policy, guideline, patent, weibo.',
            },
            exclude_sources: {
              type: 'string',
              description: 'Comma-separated list of sources to exclude from the response (e.g., "twitter,facebook"). Use this to reduce response size. Available sources: facebook, blogs, linkedin, video, pinterest, gplus, twitter, bluesky, reddit, news, f1000, rh, qna, forum, peer_reviews, policy, guideline, patent, weibo.',
            },
            post_types: {
              type: 'string',
              description: 'Filter by post types. Currently only supports "original_tweets" to exclude retweets from Twitter results.',
            },
            include_sections: {
              type: 'string',
              description: 'Comma-separated list of response sections to include (e.g., "counts,posts"). Available sections: counts, citation, altmetric_score, demographics, posts, images. Use this to reduce response size by requesting only needed sections.',
            },
          },
          required: ['identifier'],
        },
      },
      handler: async (args) => {
        const { identifier, identifier_type = 'doi', include_sources, exclude_sources, post_types, include_sections } = args;
        validateIdentifier(identifier, identifier_type);
        const endpoint = `/v1/fetch/${identifier_type}/${encodeURIComponent(identifier)}`;

        const params = {};
        if (include_sources) params.include_sources = include_sources;
        if (exclude_sources) params.exclude_sources = exclude_sources;
        if (post_types) params.post_types = post_types;
        if (include_sections) params.include_sections = include_sections;

        const data = await makeDetailsApiRequest(endpoint, params, detailsApiKey, detailsApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    search_citations: {
      definition: {
        name: 'search_citations',
        description: 'Search and retrieve aggregated citation data across all tracked research outputs for a specific timeframe. Returns lists of outputs sorted by citation counts, filtered by various criteria. Available with free tier API keys.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            timeframe: {
              type: 'string',
              enum: ['1d', '2d', '3d', '4d', '5d', '6d', '1w', '1m', '3m', '6m', '1y', 'at'],
              description: 'Timeframe for citations. Options: 1d-6d (days), 1w (week), 1m/3m/6m (months), 1y (year), at (all-time)',
              default: '1w',
            },
            citation_type: {
              type: 'string',
              description: 'Filter by citation source type (e.g., "twitter", "news", "blog", "policy", "patent", "peer_review")',
            },
            nlmid: {
              type: 'string',
              description: 'Filter by journal NLM ID',
            },
            issns: {
              type: 'string',
              description: 'Filter by journal ISSN(s), comma-separated',
            },
            subject: {
              type: 'string',
              description: 'Filter by Scopus subject area',
            },
            num_results: {
              type: 'number',
              description: 'Number of results to return (default: 100, max depends on API tier)',
            },
            page: {
              type: 'number',
              description: 'Page number for paginated results (default: 1)',
            },
          },
          required: ['timeframe'],
        },
      },
      handler: async (args) => {
        const { timeframe, citation_type, nlmid, issns, subject, num_results, page } = args;
        const endpoint = `/v1/citations/${timeframe}`;

        const params = {};
        if (citation_type) params.citation_type = citation_type;
        if (nlmid) params.nlmid = nlmid;
        if (issns) params.issns = issns;
        if (subject) params.scopus_subjects = subject;
        if (num_results) params.num_results = num_results;
        if (page) params.page = page;

        const data = await makeDetailsApiRequest(endpoint, params, detailsApiKey, detailsApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_research_outputs: {
      definition: {
        name: 'explore_research_outputs',
        description: 'Search research outputs in your Altmetric Explorer instance or across all Altmetric data. Supports full-text search, filtering by author, department, journal, publication date, research type, and more. Returns paginated results (25 per page, max 100). Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author, or journal',
            },
            scope: {
              type: 'string',
              enum: ['all', 'institution'],
              description: 'Scope of search: all research or institutional only',
            },
            title: {
              type: 'string',
              description: 'Search specifically in titles',
            },
            published_after: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            published_before: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for mentions (e.g., "1d", "1w", "1m", "3m", "6m", "1y")',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type (e.g., ["article", "dataset"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            author_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by author IDs from your Explorer instance',
            },
            department_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by department IDs from your Explorer instance',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "publication_date_desc")',
            },
            page_number: {
              type: 'number',
              description: 'Page number (default: 1)',
            },
            page_size: {
              type: 'number',
              description: 'Results per page (max: 100, default: 25)',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, scope, title, published_after, published_before, timeframe, orcid,
          type, journal_id, author_id, department_id, order, page_number, page_size
        } = args;

        const endpoint = '/explorer/api/research_outputs';
        const filters = {};

        if (q) filters.q = q;
        if (scope) filters.scope = scope;
        if (title) filters.title = title;
        if (published_after) filters.published_after = published_after;
        if (published_before) filters.published_before = published_before;
        if (timeframe) filters.timeframe = timeframe;
        if (orcid) filters.orcid = orcid;
        if (type) filters.type = type;
        if (journal_id) filters.journal_id = journal_id;
        if (author_id) filters.author_id = author_id;
        if (department_id) filters.department_id = department_id;
        if (order) filters.order = order;
        if (page_number) filters['page[number]'] = page_number;
        if (page_size) filters['page[size]'] = page_size;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_attention_summary: {
      definition: {
        name: 'explore_attention_summary',
        description: 'Get aggregated attention data for research outputs matching your query in Explorer. Returns total mentions across different sources (Twitter, news, blogs, etc.) broken down by date. This is a single-page endpoint with no pagination. Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author, or journal',
            },
            scope: {
              type: 'string',
              enum: ['all', 'institution'],
              description: 'Scope of search: all research or institutional only',
            },
            published_after: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            published_before: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for mentions (e.g., "1d", "1w", "1m", "3m", "6m", "1y")',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type (e.g., ["article", "dataset"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            author_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by author IDs from your Explorer instance',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, scope, published_after, published_before, timeframe,
          type, journal_id, author_id
        } = args;

        const endpoint = '/explorer/api/research_outputs/attention';
        const filters = {};

        if (q) filters.q = q;
        if (scope) filters.scope = scope;
        if (published_after) filters.published_after = published_after;
        if (published_before) filters.published_before = published_before;
        if (timeframe) filters.timeframe = timeframe;
        if (type) filters.type = type;
        if (journal_id) filters.journal_id = journal_id;
        if (author_id) filters.author_id = author_id;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_mentions: {
      definition: {
        name: 'explore_mentions',
        description: 'Get individual mentions of research outputs from your Explorer search. Returns detailed information about each mention including author info, URLs, timestamps, and related research outputs. Supports pagination. Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author, or journal',
            },
            scope: {
              type: 'string',
              enum: ['all', 'institution'],
              description: 'Scope of search: all research or institutional only',
            },
            mentioned_after: {
              type: 'string',
              description: 'Filter by mention date (YYYY-MM-DD)',
            },
            mentioned_before: {
              type: 'string',
              description: 'Filter by mention date (YYYY-MM-DD)',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by ISO 3166-2 country codes (e.g., ["US", "GB"])',
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for mentions (e.g., "1d", "1w", "1m", "3m", "6m", "1y")',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            page_number: {
              type: 'number',
              description: 'Page number (default: 1)',
            },
            page_size: {
              type: 'number',
              description: 'Results per page (max: 100, default: 25)',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, scope, mentioned_after, mentioned_before, countries, timeframe,
          type, page_number, page_size
        } = args;

        const endpoint = '/explorer/api/research_outputs/mentions';
        const filters = {};

        if (q) filters.q = q;
        if (scope) filters.scope = scope;
        if (mentioned_after) filters.mentioned_after = mentioned_after;
        if (mentioned_before) filters.mentioned_before = mentioned_before;
        if (countries) filters.countries = countries;
        if (timeframe) filters.timeframe = timeframe;
        if (type) filters.type = type;
        if (page_number) filters['page[number]'] = page_number;
        if (page_size) filters['page[size]'] = page_size;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_demographics: {
      definition: {
        name: 'explore_demographics',
        description: 'Get demographic information about the audiences engaging with research outputs. Analyze geographic distribution, demographic patterns, and audience characteristics. Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author, or journal',
            },
            scope: {
              type: 'string',
              enum: ['all', 'institution'],
              description: 'Scope of search: all research or institutional only',
            },
            published_after: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            published_before: {
              type: 'string',
              description: 'Filter by publication date (YYYY-MM-DD)',
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for mentions (e.g., "1d", "1w", "1m", "3m", "6m", "1y")',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            author_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by author IDs',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, scope, published_after, published_before, timeframe,
          type, journal_id, author_id
        } = args;

        const endpoint = '/explorer/api/research_outputs/demographics';
        const filters = {};

        if (q) filters.q = q;
        if (scope) filters.scope = scope;
        if (published_after) filters.published_after = published_after;
        if (published_before) filters.published_before = published_before;
        if (timeframe) filters.timeframe = timeframe;
        if (type) filters.type = type;
        if (journal_id) filters.journal_id = journal_id;
        if (author_id) filters.author_id = author_id;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_mention_sources: {
      definition: {
        name: 'explore_mention_sources',
        description: 'Get information about the sources of mentions for research outputs. Analyze which platforms, channels, and outlets are mentioning research. Includes source credibility and reach data. Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author, or journal',
            },
            scope: {
              type: 'string',
              enum: ['all', 'institution'],
              description: 'Scope of search: all research or institutional only',
            },
            mentioned_after: {
              type: 'string',
              description: 'Filter by mention date (YYYY-MM-DD)',
            },
            mentioned_before: {
              type: 'string',
              description: 'Filter by mention date (YYYY-MM-DD)',
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for mentions (e.g., "1d", "1w", "1m", "3m", "6m", "1y")',
            },
            source_type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by source type (e.g., ["news", "twitter", "policy"])',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by ISO 3166-2 country codes',
            },
            page_number: {
              type: 'number',
              description: 'Page number (default: 1)',
            },
            page_size: {
              type: 'number',
              description: 'Results per page (max: 100, default: 25)',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, scope, mentioned_after, mentioned_before, timeframe,
          source_type, countries, page_number, page_size
        } = args;

        const endpoint = '/explorer/api/research_outputs/mention_sources';
        const filters = {};

        if (q) filters.q = q;
        if (scope) filters.scope = scope;
        if (mentioned_after) filters.mentioned_after = mentioned_after;
        if (mentioned_before) filters.mentioned_before = mentioned_before;
        if (timeframe) filters.timeframe = timeframe;
        if (source_type) filters.source_type = source_type;
        if (countries) filters.countries = countries;
        if (page_number) filters['page[number]'] = page_number;
        if (page_size) filters['page[size]'] = page_size;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },

    explore_journals: {
      definition: {
        name: 'explore_journals',
        description: 'Get journal-related data and metrics. Search and filter by publication venue, analyze journal impact, and retrieve journal rankings. Useful for filtering research by publication outlet. Requires Explorer API credentials.',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for journal name or ISSN',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific journal IDs',
            },
            issn: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by ISSN(s)',
            },
            subject: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by subject area',
            },
            publisher: {
              type: 'string',
              description: 'Filter by publisher name',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "name_asc", "output_count_desc")',
            },
            page_number: {
              type: 'number',
              description: 'Page number (default: 1)',
            },
            page_size: {
              type: 'number',
              description: 'Results per page (max: 100, default: 25)',
            },
          },
        },
      },
      handler: async (args) => {
        const {
          q, journal_id, issn, subject, publisher, order,
          page_number, page_size
        } = args;

        const endpoint = '/explorer/api/research_outputs/journals';
        const filters = {};

        if (q) filters.q = q;
        if (journal_id) filters.journal_id = journal_id;
        if (issn) filters.issn = issn;
        if (subject) filters.subject = subject;
        if (publisher) filters.publisher = publisher;
        if (order) filters.order = order;
        if (page_number) filters['page[number]'] = page_number;
        if (page_size) filters['page[size]'] = page_size;

        const data = await makeExplorerApiRequest(endpoint, filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    },
  };
}
