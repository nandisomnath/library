// index.mjs
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Enhanced middleware with better security and performance
app.use(cors({
  origin: isProduction ? ['https://your-domain.vercel.app'] : true,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files with better caching in production
if (isProduction) {
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1y',
    etag: false
  }));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Enhanced Book API service with better error handling and performance
class BookService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    this.requestTimeout = 10000; // 10 seconds
  }

  // Enhanced fetch with timeout and retry logic
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Free-Library-Hub/1.0',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // Get books from Project Gutenberg with enhanced error handling
  async getGutenbergBooks(limit = 20) {
    const cacheKey = `gutenberg_${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithTimeout(
        `https://gutendex.com/books/?sort=download_count&languages=en&page=1`
      );
      const data = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('Invalid response format from Gutenberg API');
      }
      
      const books = data.results.slice(0, limit).map(book => ({
        id: book.id,
        title: book.title || 'Unknown Title',
        authors: book.authors?.map(author => author.name).join(', ') || 'Unknown Author',
        subjects: book.subjects?.slice(0, 3) || [],
        downloadCount: book.download_count || 0,
        formats: book.formats || {},
        languages: book.languages || ['en'],
        copyright: book.copyright || false,
        source: 'Project Gutenberg',
        downloadUrl: book.formats?.['text/html'] || 
                    book.formats?.['text/plain'] || 
                    book.formats?.['application/epub+zip'] || '#',
        coverImage: book.formats?.['image/jpeg'] || '/images/default-book.jpg'
      }));

      // Cache the results
      this.cache.set(cacheKey, {
        data: books,
        timestamp: Date.now()
      });

      return books;
    } catch (error) {
      console.error('Error fetching Gutenberg books:', error.message);
      return [];
    }
  }

  // Enhanced Open Library API with better error handling
  async getOpenLibraryBooks(query = 'popular', limit = 20) {
    const cacheKey = `openlibrary_${query}_${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await this.fetchWithTimeout(
        `https://openlibrary.org/search.json?q=${encodedQuery}&limit=${limit}&has_fulltext=true`
      );
      const data = await response.json();
      
      if (!data.docs || !Array.isArray(data.docs)) {
        throw new Error('Invalid response format from Open Library API');
      }
      
      const books = data.docs.map(book => ({
        id: book.key || `ol_${Math.random().toString(36).substr(2, 9)}`,
        title: book.title || 'Unknown Title',
        authors: book.author_name?.join(', ') || 'Unknown Author',
        subjects: book.subject?.slice(0, 3) || [],
        publishYear: book.first_publish_year || null,
        isbn: book.isbn?.[0] || null,
        source: 'Open Library',
        downloadUrl: book.key ? `https://openlibrary.org${book.key}` : '#',
        coverImage: book.cover_i ? 
                   `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : 
                   '/images/default-book.jpg',
        hasFulltext: book.has_fulltext || false
      }));

      // Cache the results
      this.cache.set(cacheKey, {
        data: books,
        timestamp: Date.now()
      });

      return books;
    } catch (error) {
      console.error('Error fetching Open Library books:', error.message);
      return [];
    }
  }

  // Enhanced Internet Archive API
  async getInternetArchiveBooks(limit = 20) {
    const cacheKey = `archive_${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithTimeout(
        `https://archive.org/advancedsearch.php?q=collection:opensource_books&fl=identifier,title,creator,subject,downloads,date,description&sort[]=downloads+desc&rows=${limit}&page=1&output=json`
      );
      const data = await response.json();
      
      if (!data.response?.docs || !Array.isArray(data.response.docs)) {
        throw new Error('Invalid response format from Internet Archive API');
      }
      
      const books = data.response.docs.map(book => ({
        id: book.identifier || `ia_${Math.random().toString(36).substr(2, 9)}`,
        title: book.title || 'Unknown Title',
        authors: Array.isArray(book.creator) ? 
                book.creator.join(', ') : 
                (book.creator || 'Unknown Author'),
        subjects: Array.isArray(book.subject) ? book.subject.slice(0, 3) : [],
        downloads: book.downloads || 0,
        date: book.date || null,
        description: book.description || '',
        source: 'Internet Archive',
        downloadUrl: book.identifier ? `https://archive.org/details/${book.identifier}` : '#',
        coverImage: book.identifier ? 
                   `https://archive.org/services/img/${book.identifier}` : 
                   '/images/default-book.jpg'
      }));

      // Cache the results
      this.cache.set(cacheKey, {
        data: books,
        timestamp: Date.now()
      });

      return books;
    } catch (error) {
      console.error('Error fetching Internet Archive books:', error.message);
      return [];
    }
  }

  // Enhanced trending books with better error handling
  async getTrendingBooks() {
    const cacheKey = 'trending_books';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      // Use Promise.allSettled for better error handling
      const results = await Promise.allSettled([
        this.getGutenbergBooks(10),
        this.getOpenLibraryBooks('fiction', 10),
        this.getInternetArchiveBooks(10)
      ]);

      const allBooks = results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
      
      // Cache the results even if some sources failed
      this.cache.set(cacheKey, {
        data: allBooks,
        timestamp: Date.now()
      });

      return allBooks;
    } catch (error) {
      console.error('Error fetching trending books:', error.message);
      return [];
    }
  }

  // Enhanced search with better filtering
  async searchBooks(query, limit = 30) {
    if (!query || query.trim().length === 0) {
      return this.getTrendingBooks();
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    try {
      const results = await Promise.allSettled([
        this.getGutenbergBooks(15),
        this.getOpenLibraryBooks(query, 15)
      ]);

      const [gutenbergResult, openLibraryResult] = results;
      
      let filteredGutenberg = [];
      if (gutenbergResult.status === 'fulfilled') {
        filteredGutenberg = gutenbergResult.value.filter(book => 
          book.title.toLowerCase().includes(normalizedQuery) ||
          book.authors.toLowerCase().includes(normalizedQuery) ||
          book.subjects.some(subject => 
            subject.toLowerCase().includes(normalizedQuery)
          )
        );
      }

      const openLibraryBooks = openLibraryResult.status === 'fulfilled' ? 
                              openLibraryResult.value : [];

      return [...filteredGutenberg, ...openLibraryBooks].slice(0, limit);
    } catch (error) {
      console.error('Error searching books:', error.message);
      return [];
    }
  }

  // Enhanced category search
  async getBooksByCategory(category, limit = 20) {
    if (!category || category.trim().length === 0) {
      return this.getTrendingBooks();
    }

    const normalizedCategory = category.toLowerCase().trim();
    
    try {
      const results = await Promise.allSettled([
        this.getOpenLibraryBooks(category, limit),
        this.getGutenbergBooks(limit)
      ]);

      const [openLibraryResult, gutenbergResult] = results;
      
      const openLibraryBooks = openLibraryResult.status === 'fulfilled' ? 
                              openLibraryResult.value : [];
      
      let filteredGutenberg = [];
      if (gutenbergResult.status === 'fulfilled') {
        filteredGutenberg = gutenbergResult.value.filter(book => 
          book.subjects.some(subject => 
            subject.toLowerCase().includes(normalizedCategory)
          )
        );
      }

      return [...openLibraryBooks, ...filteredGutenberg].slice(0, limit);
    } catch (error) {
      console.error('Error fetching books by category:', error.message);
      return [];
    }
  }

  // Clear cache method for maintenance
  clearCache() {
    this.cache.clear();
  }
}

const bookService = new BookService();

// Enhanced route handlers with better error handling
app.get('/', async (req, res) => {
  try {
    const trendingBooks = await bookService.getTrendingBooks();
    res.render('index', { 
      title: 'Free Library Hub',
      books: trendingBooks.slice(0, 12),
      totalBooks: trendingBooks.length
    });
  } catch (error) {
    console.error('Error loading home page:', error.message);
    res.render('index', { 
      title: 'Free Library Hub',
      books: [],
      totalBooks: 0,
      error: 'Unable to load books at the moment'
    });
  }
});

app.get('/search', async (req, res) => {
  const query = req.query.q?.trim() || '';
  const category = req.query.category?.trim() || '';
  
  try {
    let books = [];
    
    if (query) {
      books = await bookService.searchBooks(query);
    } else if (category) {
      books = await bookService.getBooksByCategory(category);
    } else {
      books = await bookService.getTrendingBooks();
    }
    
    res.render('search', { 
      title: 'Search Results',
      books,
      query,
      category,
      totalResults: books.length
    });
  } catch (error) {
    console.error('Error searching books:', error.message);
    res.render('search', { 
      title: 'Search Results',
      books: [],
      query,
      category,
      totalResults: 0,
      error: 'Search failed. Please try again.'
    });
  }
});

app.get('/categories', (req, res) => {
  const categories = [
    'Fiction', 'Non-fiction', 'Science', 'History', 'Philosophy',
    'Poetry', 'Drama', 'Adventure', 'Romance', 'Mystery',
    'Fantasy', 'Biography', 'Children', 'Education', 'Technology'
  ];
  
  res.render('categories', { 
    title: 'Browse Categories',
    categories
  });
});

app.get('/trending', async (req, res) => {
  try {
    const books = await bookService.getTrendingBooks();
    res.render('trending', { 
      title: 'Trending Books',
      books
    });
  } catch (error) {
    console.error('Error loading trending books:', error.message);
    res.render('trending', { 
      title: 'Trending Books',
      books: [],
      error: 'Unable to load trending books'
    });
  }
});

// Enhanced API endpoints with better validation and error handling
app.get('/api/books/trending', async (req, res) => {
  try {
    const books = await bookService.getTrendingBooks();
    res.json({ 
      success: true, 
      books, 
      total: books.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - trending books:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch trending books',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/books/search', async (req, res) => {
  const { q: query, category, limit = 20 } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  
  try {
    let books = [];
    
    if (query?.trim()) {
      books = await bookService.searchBooks(query.trim(), parsedLimit);
    } else if (category?.trim()) {
      books = await bookService.getBooksByCategory(category.trim(), parsedLimit);
    } else {
      books = await bookService.getTrendingBooks();
    }
    
    res.json({ 
      success: true, 
      books, 
      total: books.length,
      query: query?.trim() || null,
      category: category?.trim() || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - search books:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Search failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/books/gutenberg', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  
  try {
    const books = await bookService.getGutenbergBooks(limit);
    res.json({ 
      success: true, 
      books, 
      total: books.length,
      source: 'Project Gutenberg',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - Gutenberg books:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Gutenberg books',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/books/openlibrary', async (req, res) => {
  const { q: query = 'popular', limit = 20 } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  
  try {
    const books = await bookService.getOpenLibraryBooks(query, parsedLimit);
    res.json({ 
      success: true, 
      books, 
      total: books.length,
      source: 'Open Library',
      query,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - Open Library books:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Open Library books',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/books/archive', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  
  try {
    const books = await bookService.getInternetArchiveBooks(limit);
    res.json({ 
      success: true, 
      books, 
      total: books.length,
      source: 'Internet Archive',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API Error - Internet Archive books:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Internet Archive books',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint for monitoring
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Cache management endpoint (for admin use)
app.post('/api/cache/clear', (req, res) => {
  try {
    bookService.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

// Enhanced error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  console.error('Stack:', error.stack);
  
  if (res.headersSent) {
    return next(error);
  }
  
  const isApiRequest = req.path.startsWith('/api/');
  
  if (isApiRequest) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).render('error', { 
      title: 'Server Error',
      error: 'Something went wrong on our end. Please try again later.'
    });
  }
});

// Graceful shutdown for Vercel
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  bookService.clearCache();
});

app.listen(PORT, () => {
  console.log(`📚 Free Library Hub running on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📖 Fetching books from multiple sources...');
});

// Export for Vercel
export default app;