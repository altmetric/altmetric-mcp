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

  const hasDetailsApi = !!detailsApiKey;
  const hasExplorerApi = !!(explorerApiKey && explorerApiSecret);

  return {
    ...(hasDetailsApi ? detailsPageTools(detailsApiKey, detailsApiBaseUrl) : {}),
    ...(hasExplorerApi ? explorerTools(explorerApiKey, explorerApiSecret, explorerApiBaseUrl) : {}),
  };
}

function detailsPageTools(detailsApiKey, detailsApiBaseUrl) {
  return {
    get_citation_counts: {
      definition: {
        name: 'get_citation_counts',
        description: 'Retrieve citation counts and basic metadata for a research output using its DOI, PubMed ID, arXiv ID, or other identifier. Returns citation metrics across various platforms (Twitter, news, blogs, policy documents, etc.). Available with free tier API keys.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              title: 'Research Output Identifier',
              description: 'The identifier for the research output (e.g., DOI: "10.1038/nature12373", PubMed ID: "123456", arXiv ID: "1234.5678")',
            },
            identifier_type: {
              type: 'string',
              title: 'Identifier Type',
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

        // Create human-readable summary
        const title = data.title || 'Unknown title';
        const score = data.score || 0;
        const totalAccounts = data.cited_by_accounts_count || 0;
        const totalPosts = data.cited_by_posts_count || 0;

        const summary = `Citation data for ${identifier_type.toUpperCase()}: ${identifier}\n` +
          `Title: ${title}\n` +
          `Altmetric Score: ${score}\n` +
          `Total mentions: ${totalAccounts} unique sources, ${totalPosts} posts`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    get_citation_details: {
      definition: {
        name: 'get_citation_details',
        description: 'Retrieve detailed citation information including full text of mentions, author details, and complete metadata for a research output. This is a commercial feature requiring a paid API key. Returns comprehensive data about each mention across all tracked platforms. Note: This endpoint does not support pagination and returns all data at once.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              title: 'Research Output Identifier',
              description: 'The identifier for the research output (e.g., DOI: "10.1038/nature12373", Altmetric ID: "123456")',
            },
            identifier_type: {
              type: 'string',
              title: 'Identifier Type',
              enum: ['doi', 'id'],
              description: 'The type of identifier being used. "id" refers to the Altmetric attention score ID.',
              default: 'doi',
            },
            include_sources: {
              type: 'string',
              title: 'Include Sources',
              description: 'Comma-separated list of sources to include in the response (e.g., "twitter,news,blogs"). Use this to limit response size. Available sources: facebook, blogs, linkedin, video, pinterest, gplus, twitter, bluesky, reddit, news, f1000, rh, qna, forum, peer_reviews, policy, guideline, patent, weibo.',
            },
            exclude_sources: {
              type: 'string',
              title: 'Exclude Sources',
              description: 'Comma-separated list of sources to exclude from the response (e.g., "twitter,facebook"). Use this to reduce response size. Available sources: facebook, blogs, linkedin, video, pinterest, gplus, twitter, bluesky, reddit, news, f1000, rh, qna, forum, peer_reviews, policy, guideline, patent, weibo.',
            },
            post_types: {
              type: 'string',
              title: 'Post Types',
              description: 'Filter by post types. Currently only supports "original_tweets" to exclude retweets from Twitter results.',
            },
            include_sections: {
              type: 'string',
              title: 'Include Sections',
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

        // Create human-readable summary
        const title = data.citation?.title || 'Unknown title';
        const score = data.altmetric_score?.score || data.score || 0;
        const totalPosts = data.counts?.total?.posts_count || 0;
        const filters = [];
        if (include_sources) filters.push(`including: ${include_sources}`);
        if (exclude_sources) filters.push(`excluding: ${exclude_sources}`);
        const filterText = filters.length > 0 ? ` (${filters.join(', ')})` : '';

        const summary = `Detailed citation data for ${identifier_type.toUpperCase()}: ${identifier}\n` +
          `Title: ${title}\n` +
          `Altmetric Score: ${score}\n` +
          `Total posts: ${totalPosts}${filterText}\n` +
          `Full mention details included in structured data`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    search_citations: {
      definition: {
        name: 'search_citations',
        description: 'Search and retrieve aggregated citation data across all tracked research outputs for a specific timeframe. Returns lists of outputs sorted by citation counts, filtered by various criteria. Available with free tier API keys.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            timeframe: {
              type: 'string',
              title: 'Timeframe',
              enum: ['1d', '2d', '3d', '4d', '5d', '6d', '1w', '1m', '3m', '6m', '1y', 'at'],
              description: 'Timeframe for citations. Options: 1d-6d (days), 1w (week), 1m/3m/6m (months), 1y (year), at (all-time)',
              default: '1w',
            },
            citation_type: {
              type: 'string',
              title: 'Citation Source Type',
              description: 'Filter by citation source type (e.g., "twitter", "news", "blog", "policy", "patent", "peer_review")',
            },
            nlmid: {
              type: 'string',
              title: 'Journal NLM ID',
              description: 'Filter by journal NLM ID',
            },
            issns: {
              type: 'string',
              title: 'Journal ISSNs',
              description: 'Filter by journal ISSN(s), comma-separated',
            },
            subject: {
              type: 'string',
              title: 'Subject Area',
              description: 'Filter by Scopus subject area',
            },
            num_results: {
              type: 'number',
              title: 'Number of Results',
              description: 'Number of results to return (default: 100, max depends on API tier)',
            },
            page: {
              type: 'number',
              title: 'Page Number',
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

        // Create human-readable summary
        const resultsCount = data.results ? data.results.length : 0;
        const totalCount = data.query?.total || resultsCount;
        const currentPage = data.query?.page || page || 1;
        const filters = [];
        if (citation_type) filters.push(`type: ${citation_type}`);
        if (subject) filters.push(`subject: ${subject}`);
        if (nlmid) filters.push(`journal NLMID: ${nlmid}`);
        if (issns) filters.push(`ISSN: ${issns}`);
        const filterText = filters.length > 0 ? ` (filters: ${filters.join(', ')})` : '';

        const summary = `Citation search results for timeframe: ${timeframe}${filterText}\n` +
          `Showing ${resultsCount} results on page ${currentPage}\n` +
          `Total matching outputs: ${totalCount}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    get_batch_attention_data: {
      definition: {
        name: 'get_batch_attention_data',
        description: 'Get attention metrics for multiple publications at once. Use this when comparing papers or finding which has most/least attention. Much more efficient than calling get_citation_counts multiple times.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            dois: {
              type: 'array',
              items: { type: 'string' },
              title: 'DOIs',
              description: 'List of DOIs to fetch attention data for (max 100)',
            },
            sort_by: {
              type: 'string',
              title: 'Sort By',
              enum: ['score', 'twitter', 'news', 'blogs', 'total_mentions'],
              description: 'How to sort results (default: score)',
              default: 'score',
            },
            limit: {
              type: 'number',
              title: 'Limit',
              description: 'Max results to return (default: all)',
            },
          },
          required: ['dois'],
        },
      },
      handler: async (args) => {
        const { dois, sort_by = 'score', limit } = args;

        if (!dois || dois.length === 0) {
          return {
            content: [{ type: 'text', text: 'No DOIs provided' }],
            structuredContent: { error: 'No DOIs provided' },
          };
        }

        if (dois.length > 100) {
          return {
            content: [{ type: 'text', text: 'Too many DOIs. Maximum is 100.' }],
            structuredContent: { error: 'Too many DOIs. Maximum is 100.' },
          };
        }

        // Translate DOIs to Altmetric IDs
        const translateData = await makeDetailsApiRequest('/v1/translate', {}, detailsApiKey, detailsApiBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `ids=${dois.join('|')}`,
        });

        const doiToAltmetricId = {};
        const notFoundDois = [];
        for (const doi of dois) {
          if (translateData[doi]) {
            doiToAltmetricId[doi] = translateData[doi];
          } else {
            notFoundDois.push(doi);
          }
        }

        const altmetricIds = Object.values(doiToAltmetricId);
        if (altmetricIds.length === 0) {
          return {
            content: [{ type: 'text', text: `None of the ${dois.length} DOIs were found in Altmetric` }],
            structuredContent: { total_queried: dois.length, found: 0, not_found: notFoundDois, results: [] },
          };
        }

        // Fetch attention data for all matched IDs
        const idsData = await makeDetailsApiRequest(`/v1/id/${altmetricIds.join(',')}`, {}, detailsApiKey, detailsApiBaseUrl);

        const altmetricIdToDoi = Object.fromEntries(
          Object.entries(doiToAltmetricId).map(([doi, id]) => [id, doi])
        );
        const citations = idsData.results || [idsData];
        const results = citations.map(c => ({
          doi: altmetricIdToDoi[c.altmetric_id] || c.doi,
          altmetric_id: c.altmetric_id,
          title: c.title || 'Unknown title',
          score: c.score || 0,
          cited_by_accounts_count: c.cited_by_accounts_count || 0,
          cited_by_posts_count: c.cited_by_posts_count || 0,
          cited_by_tweeters_count: c.cited_by_tweeters_count || 0,
          cited_by_msm_count: c.cited_by_msm_count || 0,
          cited_by_feeds_count: c.cited_by_feeds_count || 0,
          cited_by_fbwalls_count: c.cited_by_fbwalls_count || 0,
          cited_by_policies_count: c.cited_by_policies_count || 0,
          cited_by_wikipedia_count: c.cited_by_wikipedia_count || 0,
        }));

        const batchData = { found: Object.keys(doiToAltmetricId), not_found: notFoundDois, results };

        // Sort results based on sort_by parameter
        const sortKeyMap = {
          score: 'score',
          twitter: 'cited_by_tweeters_count',
          news: 'cited_by_msm_count',
          blogs: 'cited_by_feeds_count',
          total_mentions: 'cited_by_posts_count',
        };

        const sortKey = sortKeyMap[sort_by] || 'score';
        batchData.results.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

        // Apply limit if specified
        if (limit && limit > 0) {
          batchData.results = batchData.results.slice(0, limit);
        }

        // Add rank to results
        batchData.results = batchData.results.map((item, index) => ({
          rank: index + 1,
          ...item,
        }));

        // Create human-readable summary
        const totalQueried = dois.length;
        const totalFound = batchData.found.length;
        const totalNotFound = batchData.not_found.length;

        let summary = `Batch attention data for ${totalQueried} DOIs\n`;
        summary += `Found: ${totalFound}, Not found: ${totalNotFound}\n`;
        summary += `Sorted by: ${sort_by}\n\n`;

        if (batchData.results.length > 0) {
          summary += `Top results:\n`;
          const topResults = batchData.results.slice(0, 5);
          topResults.forEach((item) => {
            summary += `${item.rank}. "${item.title}" (Score: ${item.score})\n`;
          });
        }

        return {
          content: [{ type: 'text', text: summary }],
          structuredContent: {
            total_queried: totalQueried,
            found: totalFound,
            not_found: batchData.not_found,
            results: batchData.results,
          },
        };
      },
    },

    translate_identifiers: {
      definition: {
        name: 'translate_identifiers',
        description: 'Translate research output identifiers (DOIs, PMIDs, arXiv IDs, etc.) into Altmetric IDs. Useful for discovering which identifiers Altmetric has data for. Supports batch translation of up to 100,000 identifiers per request. The identifier type is auto-detected. This is a commercial feature requiring a paid API key.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            identifiers: {
              type: 'array',
              items: { type: 'string' },
              description: 'One or more research output identifiers to translate (e.g., DOIs: "10.1038/news.2011.490", PMIDs: "21148220", arXiv IDs: "1509.03622"). Identifier types are auto-detected.',
            },
          },
          required: ['identifiers'],
        },
      },
      handler: async (args) => {
        const { identifiers } = args;

        if (!identifiers || identifiers.length === 0) {
          throw new Error('At least one identifier is required');
        }

        if (identifiers.length > 100000) {
          throw new Error('Maximum 100,000 identifiers per request');
        }

        const pipeDelimited = identifiers.join('|');
        const data = await makeDetailsApiRequest(
          '/v1/translate',
          {},
          detailsApiKey,
          detailsApiBaseUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `ids=${pipeDelimited}`,
          },
        );

        const translatedCount = Object.keys(data).length;
        const summary = `Translated ${identifiers.length} identifier(s)\n` +
          `${translatedCount} matched to Altmetric IDs\n` +
          `${identifiers.length - translatedCount} not found in Altmetric`;

        return {
          content: [{ type: 'text', text: summary }],
          structuredContent: data,
        };
      },
    },
  };
}

const EXPLORER_TIMEFRAMES = ['at', '1d', '3d', '1w', '1m', '3m', '6m', '1y'];
const EXPLORER_SCOPES = ['all', 'institution'];

const SHARED_FILTER_KEYS = [
  'q', 'scope', 'title', 'published_after', 'published_before', 'timeframe',
  'orcid', 'identifier_list_id', 'type', 'open_access_types', 'journal_id',
  'doi_prefix', 'author_id', 'department_id', 'publisher_id', 'funders',
  'handle_prefix', 'affiliations', 'field_of_research_codes',
  'sustainable_development_goals', 'order',
];

const PAGINATION_KEY_MAP = {
  page_number: 'page[number]',
  page_size: 'page[size]',
};

function buildFilters(args, extraKeys = []) {
  const filters = {};
  const allKeys = [...SHARED_FILTER_KEYS, ...extraKeys];

  for (const key of allKeys) {
    if (args[key] != null) {
      const mappedKey = PAGINATION_KEY_MAP[key] || key;
      filters[mappedKey] = args[key];
    }
  }

  return filters;
}

function explorerTools(explorerApiKey, explorerApiSecret, explorerApiBaseUrl) {
  return {
    explore_research_outputs: {
      definition: {
        name: 'explore_research_outputs',
        description: 'Search research outputs in your Altmetric Explorer instance or across all Altmetric data. Supports full-text search, filtering by author, department, journal, publication date, research type, and more. Returns paginated results (25 per page, max 100). Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type (e.g., ["article", "dataset", "book", "chapter", "clinical_trial_study_record", "news"])',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs (internal Altmetric IDs)',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix (e.g., ["10.1013"])',
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
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs (e.g., ["grid.431093.c"])',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs (e.g., ["grid.3575.4"])',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes (e.g., ["3006"])',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers (e.g., ["3"])',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "score_asc", "publication_date_asc", "publication_date", "msm", "blogs", "policy", "twitter", "bluesky", "mentions_1w", "mentions_1m", "citations", "mendeley")',
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
        const filters = buildFilters(args, ['page_number', 'page_size']);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const resultsCount = data.data ? data.data.length : 0;
        const totalCount = data.meta?.response?.['total-results'] || resultsCount;
        const totalPages = data.meta?.response?.['total-pages'] || 1;
        const queryText = args.q ? ` matching "${args.q}"` : '';
        const scopeText = args.scope ? ` (scope: ${args.scope})` : '';
        const currentPage = args.page_number || 1;

        const summary = `Research outputs${queryText}${scopeText}\n` +
          `Showing ${resultsCount} results on page ${currentPage} of ${totalPages}\n` +
          `Total matching outputs: ${totalCount}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    explore_attention_summary: {
      definition: {
        name: 'explore_attention_summary',
        description: 'Get aggregated attention data for research outputs matching your query in Explorer. Returns total mentions across different sources (Twitter, news, blogs, etc.) broken down by date. This is a single-page endpoint with no pagination. Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type (e.g., ["article", "dataset"])',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix (e.g., ["10.1013"])',
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
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "publication_date_asc", "msm", "twitter")',
            },
          },
        },
      },
      handler: async (args) => {
        const filters = buildFilters(args);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs/attention', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const sourcesCount = data.data ? data.data.length : 0;
        const totalMentions = data.meta?.response?.['total-mentions'] || 0;
        const queryText = args.q ? ` for query "${args.q}"` : '';
        const scopeText = args.scope ? ` (scope: ${args.scope})` : '';
        const timeText = args.timeframe ? ` in timeframe: ${args.timeframe}` : '';

        const summary = `Attention summary${queryText}${scopeText}${timeText}\n` +
          `${sourcesCount} attention sources tracked\n` +
          `Aggregated mention data by source and date included in structured data`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    explore_mentions: {
      definition: {
        name: 'explore_mentions',
        description: 'Get individual mentions of research outputs from your Explorer search. Returns detailed information about each mention including author info, URLs, timestamps, and related research outputs. Supports pagination. Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
            mentioned_after: {
              type: 'string',
              description: 'Filter mentions created after date (YYYY-MM-DD)',
            },
            mentioned_before: {
              type: 'string',
              description: 'Filter mentions created before date (YYYY-MM-DD)',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output author affiliation country using ISO 3166-2 codes (e.g., ["US", "GB", "IT"]). Note: this filters by author country, not by mention source country. To see geographic distribution of mentions themselves, use explore_demographics instead.',
            },
            timeframe: {
              type: 'string',
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix',
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
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "publication_date_asc", "msm", "twitter")',
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
        const filters = buildFilters(args, ['mentioned_after', 'mentioned_before', 'countries', 'page_number', 'page_size']);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs/mentions', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const mentionsCount = data.data ? data.data.length : 0;
        const totalCount = data.meta?.response?.['total-results'] || mentionsCount;
        const totalPages = data.meta?.response?.['total-pages'] || 1;
        const queryText = args.q ? ` matching "${args.q}"` : '';
        const currentPage = args.page_number || 1;

        const summary = `Individual mentions${queryText}\n` +
          `Showing ${mentionsCount} mentions on page ${currentPage} of ${totalPages}\n` +
          `Total mentions: ${totalCount}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    explore_demographics: {
      definition: {
        name: 'explore_demographics',
        description: 'Get geographic distribution of mentions by country for specific mention sources. Use this to find where mentions originate from (e.g., which countries are tweeting about or covering research in the news). Supports X (tweet), Facebook (fbwall), news (msm), policy, and guideline demographics. Defaults to X if no source specified. Returns mention counts and unique sources per country. This is the only way to get mention-level country data; the countries filter on other endpoints filters by author affiliation country, not mention origin. Single-page endpoint, no pagination. Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['tweet', 'fbwall', 'msm', 'policy', 'guideline'],
              description: 'Demographic source to view. Defaults to X (tweet) if not specified.',
            },
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix',
            },
            author_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by author IDs',
            },
            department_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by department IDs from your Explorer instance',
            },
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers',
            },
          },
        },
      },
      handler: async (args) => {
        const filters = buildFilters(args, ['filter']);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs/demographics', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const countriesCount = data.data ? data.data.length : 0;
        const queryText = args.q ? ` for query "${args.q}"` : '';
        const scopeText = args.scope ? ` (scope: ${args.scope})` : '';
        const timeText = args.timeframe ? ` in timeframe: ${args.timeframe}` : '';
        const sourceText = args.filter ? ` [source: ${args.filter}]` : ' [source: tweet]';

        const summary = `Demographics data${queryText}${scopeText}${timeText}${sourceText}\n` +
          `${countriesCount} countries/regions with mention activity\n` +
          `Geographic distribution by mention count and unique sources included in structured data`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    explore_mention_sources: {
      definition: {
        name: 'explore_mention_sources',
        description: 'Get the number of mentions per mention source for research outputs matching your search. Analyze which platforms, channels, and outlets are mentioning research. Supports pagination. Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
            mentioned_after: {
              type: 'string',
              description: 'Filter mentions created after date (YYYY-MM-DD)',
            },
            mentioned_before: {
              type: 'string',
              description: 'Filter mentions created before date (YYYY-MM-DD)',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output author affiliation country using ISO 3166-2 codes (e.g., ["US", "GB", "IT"]). Note: this filters by author country, not by mention source country. To see geographic distribution of mentions themselves, use explore_demographics instead.',
            },
            timeframe: {
              type: 'string',
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix',
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
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "publication_date_asc", "msm", "twitter")',
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
        const filters = buildFilters(args, ['mentioned_after', 'mentioned_before', 'countries', 'page_number', 'page_size']);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs/mention_sources', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const sourcesCount = data.data ? data.data.length : 0;
        const totalCount = data.meta?.response?.['total-results'] || sourcesCount;
        const totalPages = data.meta?.response?.['total-pages'] || 1;
        const totalMentions = data.meta?.response?.['total-mentions'] || 0;
        const queryText = args.q ? ` matching "${args.q}"` : '';
        const currentPage = args.page_number || 1;

        const summary = `Mention sources${queryText}\n` +
          `Showing ${sourcesCount} sources on page ${currentPage} of ${totalPages}\n` +
          `Total sources: ${totalCount}, Total mentions: ${totalMentions}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },

    explore_journals: {
      definition: {
        name: 'explore_journals',
        description: 'Get aggregated mention data by journal. Returns journal names, ISSNs, and mention counts broken down by source type. This is a single-page endpoint with no pagination. Requires Explorer API credentials.',
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              description: 'Search query for title, author name, editor name, or journal',
            },
            scope: {
              type: 'string',
              enum: EXPLORER_SCOPES,
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
              enum: EXPLORER_TIMEFRAMES,
              description: 'Timeframe for mentions',
            },
            orcid: {
              type: 'string',
              description: 'Filter by author ORCID identifier',
            },
            identifier_list_id: {
              type: 'string',
              description: 'Filter by identifier list ID (created in Altmetric Explorer UI)',
            },
            type: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by research output type',
            },
            open_access_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by access status (e.g., ["closed", "oa_all", "bronze", "green", "gold", "hybrid"])',
            },
            journal_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by journal IDs',
            },
            doi_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by DOI prefix',
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
            publisher_id: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by publisher IDs (UUIDs)',
            },
            funders: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by funder GRID IDs',
            },
            handle_prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by Handle.net prefix',
            },
            affiliations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by affiliation GRID IDs',
            },
            field_of_research_codes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by field of research codes',
            },
            sustainable_development_goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by UN Sustainable Development Goal numbers',
            },
            order: {
              type: 'string',
              description: 'Sort order (e.g., "score_desc", "publication_date_asc", "msm", "twitter")',
            },
          },
        },
      },
      handler: async (args) => {
        const filters = buildFilters(args);

        const data = await makeExplorerApiRequest('/explorer/api/research_outputs/journals', filters, explorerApiKey, explorerApiSecret, explorerApiBaseUrl);

        // Create human-readable summary
        const journalsCount = data.data ? data.data.length : 0;
        const totalCount = data.meta?.response?.['total-results'] || journalsCount;
        const queryText = args.q ? ` matching "${args.q}"` : '';

        const summary = `Journals${queryText}\n` +
          `Showing ${journalsCount} journals\n` +
          `Total journals: ${totalCount}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: data,
        };
      },
    },
  };
}
