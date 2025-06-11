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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Book API service functions
class BookService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
  }

  // Get books from Project Gutenberg (Free classics)
  async getGutenbergBooks(limit = 20) {
    try {
      const response = await fetch(`https://gutendex.com/books/?sort=download_count&languages=en&page=1`);
      const data = await response.json();
      
      return data.results.slice(0, limit).map(book => ({
        id: book.id,
        title: book.title,
        authors: book.authors.map(author => author.name).join(', '),
        subjects: book.subjects.slice(0, 3),
        downloadCount: book.download_count,
        formats: book.formats,
        languages: book.languages,
        copyright: book.copyright,
        source: 'Project Gutenberg',
        downloadUrl: book.formats['text/html'] || book.formats['text/plain'] || book.formats['application/epub+zip'],
        coverImage: book.formats['image/jpeg'] || '/images/default-book.jpg'
      }));
    } catch (error) {
      console.error('Error fetching Gutenberg books:', error);
      return [];
    }
  }

  // Get books from Open Library API
  async getOpenLibraryBooks(query = 'popular', limit = 20) {
    try {
      const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&has_fulltext=true`);
      const data = await response.json();
      
      return data.docs.map(book => ({
        id: book.key,
        title: book.title,
        authors: book.author_name ? book.author_name.join(', ') : 'Unknown',
        subjects: book.subject ? book.subject.slice(0, 3) : [],
        publishYear: book.first_publish_year,
        isbn: book.isbn ? book.isbn[0] : null,
        source: 'Open Library',
        downloadUrl: `https://openlibrary.org${book.key}`,
        coverImage: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : '/images/default-book.jpg',
        hasFulltext: book.has_fulltext
      }));
    } catch (error) {
      console.error('Error fetching Open Library books:', error);
      return [];
    }
  }

  // Get books from Internet Archive
  async getInternetArchiveBooks(limit = 20) {
    try {
      const response = await fetch(`https://archive.org/advancedsearch.php?q=collection:opensource_books&fl=identifier,title,creator,subject,downloads,date,description&sort[]=downloads+desc&rows=${limit}&page=1&output=json`);
      const data = await response.json();
      
      return data.response.docs.map(book => ({
        id: book.identifier,
        title: book.title,
        authors: Array.isArray(book.creator) ? book.creator.join(', ') : (book.creator || 'Unknown'),
        subjects: Array.isArray(book.subject) ? book.subject.slice(0, 3) : [],
        downloads: book.downloads,
        date: book.date,
        description: book.description,
        source: 'Internet Archive',
        downloadUrl: `https://archive.org/details/${book.identifier}`,
        coverImage: `https://archive.org/services/img/${book.identifier}`
      }));
    } catch (error) {
      console.error('Error fetching Internet Archive books:', error);
      return [];
    }
  }

  // Get trending books from multiple sources
  async getTrendingBooks() {
    const cacheKey = 'trending_books';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const [gutenbergBooks, openLibraryBooks, archiveBooks] = await Promise.all([
        this.getGutenbergBooks(10),
        this.getOpenLibraryBooks('fiction', 10),
        this.getInternetArchiveBooks(10)
      ]);

      const allBooks = [...gutenbergBooks, ...openLibraryBooks, ...archiveBooks];
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: allBooks,
        timestamp: Date.now()
      });

      return allBooks;
    } catch (error) {
      console.error('Error fetching trending books:', error);
      return [];
    }
  }

  // Search books across all sources
  async searchBooks(query, limit = 30) {
    try {
      const [gutenbergBooks, openLibraryBooks] = await Promise.all([
        this.getGutenbergBooks(15),
        this.getOpenLibraryBooks(query, 15)
      ]);

      // Filter Gutenberg books by query
      const filteredGutenberg = gutenbergBooks.filter(book => 
        book.title.toLowerCase().includes(query.toLowerCase()) ||
        book.authors.toLowerCase().includes(query.toLowerCase()) ||
        book.subjects.some(subject => subject.toLowerCase().includes(query.toLowerCase()))
      );

      return [...filteredGutenberg, ...openLibraryBooks].slice(0, limit);
    } catch (error) {
      console.error('Error searching books:', error);
      return [];
    }
  }

  // Get books by category
  async getBooksByCategory(category, limit = 20) {
    try {
      const [openLibraryBooks, gutenbergBooks] = await Promise.all([
        this.getOpenLibraryBooks(category, limit),
        this.getGutenbergBooks(limit)
      ]);

      // Filter Gutenberg books by category
      const filteredGutenberg = gutenbergBooks.filter(book => 
        book.subjects.some(subject => subject.toLowerCase().includes(category.toLowerCase()))
      );

      return [...openLibraryBooks, ...filteredGutenberg].slice(0, limit);
    } catch (error) {
      console.error('Error fetching books by category:', error);
      return [];
    }
  }
}

const bookService = new BookService();

// Routes
app.get('/', async (req, res) => {
  try {
    const trendingBooks = await bookService.getTrendingBooks();
    res.render('index', { 
      title: 'Free Library Hub',
      books: trendingBooks.slice(0, 12),
      totalBooks: trendingBooks.length
    });
  } catch (error) {
    console.error('Error loading home page:', error);
    res.render('index', { 
      title: 'Free Library Hub',
      books: [],
      totalBooks: 0,
      error: 'Unable to load books at the moment'
    });
  }
});

app.get('/search', async (req, res) => {
  const query = req.query.q || '';
  const category = req.query.category || '';
  
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
    console.error('Error searching books:', error);
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
    console.error('Error loading trending books:', error);
    res.render('trending', { 
      title: 'Trending Books',
      books: [],
      error: 'Unable to load trending books'
    });
  }
});

// API endpoints
app.get('/api/books/trending', async (req, res) => {
  try {
    const books = await bookService.getTrendingBooks();
    res.json({ success: true, books, total: books.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/books/search', async (req, res) => {
  const { q: query, category, limit = 20 } = req.query;
  
  try {
    let books = [];
    
    if (query) {
      books = await bookService.searchBooks(query, parseInt(limit));
    } else if (category) {
      books = await bookService.getBooksByCategory(category, parseInt(limit));
    } else {
      books = await bookService.getTrendingBooks();
    }
    
    res.json({ success: true, books, total: books.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/books/gutenberg', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const books = await bookService.getGutenbergBooks(limit);
    res.json({ success: true, books, total: books.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/books/openlibrary', async (req, res) => {
  const { q: query = 'popular', limit = 20 } = req.query;
  try {
    const books = await bookService.getOpenLibraryBooks(query, parseInt(limit));
    res.json({ success: true, books, total: books.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/books/archive', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const books = await bookService.getInternetArchiveBooks(limit);
    res.json({ success: true, books, total: books.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).render('error', { 
    title: 'Server Error',
    error: 'Something went wrong on our end. Please try again later.'
  });
});

app.listen(PORT, () => {
  console.log(`📚 Free Library Hub running on http://localhost:${PORT}`);
  console.log('📖 Fetching books from multiple sources...');
});